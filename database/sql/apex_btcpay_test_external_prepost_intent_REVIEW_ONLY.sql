-- PR #125. DISPOSABLE POSTGRES REGTEST ONLY. NO HOSTED MIGRATION.
-- A one-shot external BTCPay POST intention is durably reserved BEFORE the
-- provider call. No API call exists in SQL. The original hold remains active.
begin;
create table public.btcpay_test_provider_post_intents (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 scope_id uuid not null unique references public.btcpay_test_split_sync_holds(scope_id)
   on delete restrict,
 permit_request_id uuid not null unique references public.btcpay_test_release_requests(id)
   on delete restrict,
 btcpay_store_id text not null check (btcpay_store_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 order_reference text not null check (order_reference ~ '^[A-Za-z0-9_-]{1,100}$'),
 amount_sats bigint not null check (amount_sats between 1000 and 100000000),
 network text not null default 'regtest' check(network='regtest'),
 audit_head_id bigint not null references public.btcpay_test_sync_recovery_events(id)
   on delete restrict,
 reserved_at timestamptz not null default clock_timestamp(),
 unique(btcpay_store_id,order_reference)
);
create table public.btcpay_test_provider_post_observations (
 id bigint generated always as identity primary key,
 intent_id uuid not null references public.btcpay_test_provider_post_intents(id)
   on delete restrict,
 kind text not null check(kind in ('post_outcome_unknown','invoice_seen_by_readback')),
 provider_invoice_id text check(provider_invoice_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(intent_id,kind),
 check((kind='post_outcome_unknown' and provider_invoice_id is null) or
       (kind='invoice_seen_by_readback' and provider_invoice_id is not null))
);
alter table public.btcpay_test_provider_post_intents enable row level security;
alter table public.btcpay_test_provider_post_observations enable row level security;
revoke all on public.btcpay_test_provider_post_intents,
 public.btcpay_test_provider_post_observations from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_provider_post_intents,
 public.btcpay_test_provider_post_observations to authenticated;
create policy btcpay_test_post_intents_admin_read
 on public.btcpay_test_provider_post_intents for select to authenticated
 using (exists(select 1 from public.apex_admin_memberships m
  where m.user_id=(select auth.uid())) and
  (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create policy btcpay_test_post_observations_admin_read
 on public.btcpay_test_provider_post_observations for select to authenticated
 using (exists(select 1 from public.apex_admin_memberships m
  where m.user_id=(select auth.uid())) and
  (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create trigger btcpay_test_post_intent_immutable
 before update or delete on public.btcpay_test_provider_post_intents
 for each row execute function apex_test_internal.block_test_receipt_mutation();
create trigger btcpay_test_post_observation_immutable
 before update or delete on public.btcpay_test_provider_post_observations
 for each row execute function apex_test_internal.block_test_receipt_mutation();

-- Only an isolated SQL operator can call; never grant a Next.js or browser
-- role. This commits the entitlement as CONSUMED before the external request
-- begins, eliminating automatic retries after process crashes/timeouts.
create function apex_test_internal.reserve_btcpay_test_provider_post(
 p_scope uuid,p_btcpay_store text,p_order text,p_amount_sats bigint)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare
 v_permit public.btcpay_test_checkout_resume_permits%rowtype;
 v_approval public.btcpay_test_release_approvals%rowtype;
 v_request public.btcpay_test_release_requests%rowtype;
 v_intent uuid;
begin
 if p_scope is null or p_btcpay_store is null or
   p_btcpay_store !~ '^[A-Za-z0-9_-]{1,100}$' or
   p_order is null or p_order !~ '^[A-Za-z0-9_-]{1,100}$' or
   p_amount_sats is null or p_amount_sats<1000 or
   p_amount_sats>100000000 then
   raise exception 'Invalid synthetic provider reservation' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(
   hashtextextended('storefront:'||p_scope::text,0));
 select * into v_permit from public.btcpay_test_checkout_resume_permits
   where scope_id=p_scope and status='open';
 if not found then
   raise exception 'No open regtest one-shot permit' using errcode='55000';
 end if;
 select * into v_approval from public.btcpay_test_release_approvals
   where scope_id=p_scope and request_id=v_permit.request_id and
    audit_head_id=v_permit.audit_head_id;
 select * into v_request from public.btcpay_test_release_requests
   where id=v_permit.request_id and scope_id=p_scope;
 if v_approval.scope_id is null or v_request.id is null or
   v_request.requested_by=v_approval.approved_by or
   v_request.rule_id is distinct from v_approval.rule_id or
   v_request.rule_version is distinct from v_approval.rule_version or
   v_request.allocation_snapshot is distinct from v_approval.allocation_snapshot or
   v_request.audit_head_id is distinct from v_approval.audit_head_id or
   not apex_test_internal.test_release_evidence_current(
      p_scope,v_approval.rule_id,v_approval.rule_version,
      v_approval.allocation_snapshot,v_approval.audit_head_id) then
    raise exception 'Stale or missing independent provider approval'
      using errcode='55000';
 end if;
 if exists(select 1 from public.btcpay_test_provider_post_intents
   where scope_id=p_scope or
    (btcpay_store_id=p_btcpay_store and order_reference=p_order)) then
   raise exception 'Provider POST already reserved; never retry'
      using errcode='55000';
 end if;
 insert into public.btcpay_test_provider_post_intents(
   scope_id,permit_request_id,btcpay_store_id,order_reference,
   amount_sats,audit_head_id)
 values(p_scope,v_permit.request_id,p_btcpay_store,p_order,
        p_amount_sats,v_permit.audit_head_id)
 returning id into v_intent;
 update public.btcpay_test_checkout_resume_permits
  set status='consumed',terminal_at=clock_timestamp()
  where scope_id=p_scope and status='open';
 if not found then
    raise exception 'Concurrent permit loss; provider call forbidden'
      using errcode='55000';
 end if;
 return v_intent;
end; $$;
revoke all on function apex_test_internal.reserve_btcpay_test_provider_post(
 uuid,text,text,bigint) from PUBLIC,anon,authenticated;

-- A trusted test operator may log what was independently observed; these
-- observations never authorize fulfillment, split activation or a retry.
create function apex_test_internal.observe_btcpay_test_provider_post(
 p_intent uuid,p_kind text,p_invoice text default null)
returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare
 v_intent public.btcpay_test_provider_post_intents%rowtype;
begin
 if p_intent is null or p_kind is null or
   p_kind not in ('post_outcome_unknown','invoice_seen_by_readback') or
   (p_kind='post_outcome_unknown' and p_invoice is not null) or
   (p_kind='invoice_seen_by_readback' and
     (p_invoice is null or p_invoice !~ '^[A-Za-z0-9_-]{1,100}$')) then
   raise exception 'Invalid provider observation' using errcode='22023';
 end if;
 select * into v_intent from public.btcpay_test_provider_post_intents
    where id=p_intent;
 if not found then raise exception 'Unknown external invoice intent'
  using errcode='55000'; end if;
 perform pg_advisory_xact_lock(
    hashtextextended('storefront:'||v_intent.scope_id::text,0));
 if exists(select 1 from public.btcpay_test_provider_post_observations
  where intent_id=p_intent and kind=p_kind) then
   raise exception 'Observation already logged; append-only'
      using errcode='55000';
 end if;
 insert into public.btcpay_test_provider_post_observations(
  intent_id,kind,provider_invoice_id) values(p_intent,p_kind,p_invoice);
 return 'recorded_without_checkout_authorization';
end; $$;
revoke all on function apex_test_internal.observe_btcpay_test_provider_post(
 uuid,text,text) from PUBLIC,anon,authenticated;
commit;
