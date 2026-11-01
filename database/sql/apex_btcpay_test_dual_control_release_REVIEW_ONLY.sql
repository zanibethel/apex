-- PR #123. DISPOSABLE POSTGRES ONLY. NOT A HOSTED SUPABASE MIGRATION.
-- Two distinct trusted platform admins must sign a specific hold + audit head
-- before a synthetic invoice writer may resume. This never changes Prism,
-- production checkout, rule status, wallets or any payout.
begin;

create table public.btcpay_test_release_requests (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 scope_id uuid not null unique references public.btcpay_test_split_sync_holds(scope_id) on delete restrict,
 rule_id uuid not null references public.payout_rules(id) on delete restrict,
 rule_version integer not null check (rule_version>0),
 allocation_snapshot jsonb not null,
 audit_head_id bigint not null references public.btcpay_test_sync_recovery_events(id) on delete restrict,
 requested_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 unique (id,scope_id)
);
create table public.btcpay_test_release_approvals (
 scope_id uuid primary key references public.btcpay_test_split_sync_holds(scope_id) on delete restrict,
 request_id uuid not null unique references public.btcpay_test_release_requests(id) on delete restrict,
 rule_id uuid not null references public.payout_rules(id) on delete restrict,
 rule_version integer not null check(rule_version>0),
 allocation_snapshot jsonb not null,
 audit_head_id bigint not null references public.btcpay_test_sync_recovery_events(id) on delete restrict,
 approved_by uuid not null references auth.users(id) on delete restrict,
 approved_at timestamptz not null default clock_timestamp()
);
alter table public.btcpay_test_release_requests enable row level security;
alter table public.btcpay_test_release_approvals enable row level security;
revoke all on public.btcpay_test_release_requests,
 public.btcpay_test_release_approvals from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_release_requests,
 public.btcpay_test_release_approvals to authenticated;
create policy btcpay_test_release_requests_admin_read
 on public.btcpay_test_release_requests for select to authenticated
 using(exists(select 1 from public.apex_admin_memberships a
  where a.user_id=(select auth.uid())) and
  (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create policy btcpay_test_release_approvals_admin_read
 on public.btcpay_test_release_approvals for select to authenticated
 using(exists(select 1 from public.apex_admin_memberships a
  where a.user_id=(select auth.uid())) and
  (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create trigger btcpay_test_release_requests_no_mutation
 before update or delete on public.btcpay_test_release_requests
 for each row execute function apex_test_internal.block_test_receipt_mutation();
create trigger btcpay_test_release_approvals_no_mutation
 before update or delete on public.btcpay_test_release_approvals
 for each row execute function apex_test_internal.block_test_receipt_mutation();

-- This function uses only synthetic evidence inside disposable PostgreSQL.
-- The caller must already own the storefront advisory xact lock. Neither
-- event names nor their synthetic SHA256 strings attest actual provider facts.
create function apex_test_internal.test_release_evidence_current(
 p_scope uuid,p_rule uuid,p_version integer,p_allocations jsonb,p_audit_head bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_last bigint;
 v_kind text;
 v_alloc jsonb;
 v_total bigint;
 v_count bigint;
 v_inactive bigint;
begin
 if p_scope is null or p_rule is null or p_version is null or
    p_allocations is null or p_audit_head is null then return false; end if;
 if not exists(select 1 from public.btcpay_test_split_sync_holds h
    where h.scope_id=p_scope and h.rule_id=p_rule and
      h.rule_version=p_version and h.allocation_snapshot=p_allocations and
      h.status='held') then return false; end if;
 if not exists(select 1 from public.payout_rules r
    where r.id=p_rule and r.scope_type='storefront' and
      r.scope_id=p_scope and r.version=p_version and r.status='draft') then
   return false;
 end if;
 if not exists(select 1 from public.btcpay_test_split_activation_reviews a
   where a.rule_id=p_rule and a.scope_id=p_scope and
     a.rule_version=p_version and
     a.allocation_snapshot=p_allocations and
     a.status='approved_pending_manual_sync') then return false; end if;
 select max(e.id) into v_last from public.btcpay_test_sync_recovery_events e
  where e.scope_id=p_scope;
 if v_last is distinct from p_audit_head then return false; end if;
 select kind into v_kind from public.btcpay_test_sync_recovery_events
  where id=v_last and scope_id=p_scope and rule_id=p_rule;
 if v_kind is distinct from 'operator_release_reviewed' then return false; end if;
 if apex_test_internal.assess_btcpay_test_release_readiness(p_scope)
     <> 'review_only_candidate_checkout_stays_held' then return false; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'recipient_id',a.recipient_id,'basis_points',a.basis_points)
    order by a.recipient_id),'[]'::jsonb),
    count(*),coalesce(sum(a.basis_points),0),
    count(*) filter (where d.id is null or d.status<>'active')
 into v_alloc,v_count,v_total,v_inactive
 from public.payout_rule_allocations a
 left join public.payout_recipients d on d.id=a.recipient_id
 where a.rule_id=p_rule;
 if v_alloc is distinct from p_allocations or v_count<2 or
    v_total<>10000 or v_inactive<>0 then return false; end if;
 if exists(select 1 from public.btcpay_test_invoices i
   left join public.btcpay_test_order_status o
    on o.btcpay_store_id=i.btcpay_store_id and o.invoice_id=i.invoice_id
   left join public.btcpay_test_invoice_finality_proofs f
    on f.btcpay_store_id=i.btcpay_store_id and f.invoice_id=i.invoice_id
   where i.apex_store_id=p_scope and (
    o.status is distinct from 'settled_reported' or
    f.invoice_id is null or f.confirmed_claims is distinct from true or
    f.confirmed_wallet_receipts is distinct from true)) then return false; end if;
 if exists(select 1 from public.payment_allocation_snapshots s
    join public.payout_rules r on r.id=s.rule_id
    join public.payment_allocation_entries a on a.snapshot_id=s.id
    left join public.payout_transfer_records t
      on t.snapshot_id=a.snapshot_id and t.recipient_id=a.recipient_id
    where r.scope_type='storefront' and r.scope_id=p_scope and
     (t.id is null or t.state<>'confirmed')) then return false; end if;
 if exists(select 1 from public.payout_rules r
    where r.scope_type='storefront' and r.scope_id=p_scope and
      r.id<>p_rule and r.status in ('scheduled','active')) then return false; end if;
 return true;
end; $$;
revoke all on function apex_test_internal.test_release_evidence_current(
 uuid,uuid,integer,jsonb,bigint) from PUBLIC,anon,authenticated;

-- User-facing test RPCs are explicitly authenticated and require BOTH
-- a trusted JWT app_metadata role AND independently managed membership.
create function public.request_btcpay_test_checkout_release(p_scope uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_hold public.btcpay_test_split_sync_holds%rowtype;
 v_head bigint;
 v_request uuid;
begin
 if auth.uid() is null or
   coalesce(auth.jwt()->'app_metadata'->>'apex_role','')<>'platform_admin' or
   not exists(select 1 from public.apex_admin_memberships m
      where m.user_id=auth.uid()) then
    raise exception 'Verified administrator required' using errcode='42501';
 end if;
 if p_scope is null then raise exception 'Missing store' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||p_scope::text,0));
 select * into v_hold from public.btcpay_test_split_sync_holds
    where scope_id=p_scope;
 if not found then raise exception 'No held store' using errcode='55000'; end if;
 select max(id) into v_head from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope;
 if not apex_test_internal.test_release_evidence_current(
   p_scope,v_hold.rule_id,v_hold.rule_version,v_hold.allocation_snapshot,v_head)
 then raise exception 'Synthetic release evidence incomplete or stale'
   using errcode='55000'; end if;
 if exists(select 1 from public.btcpay_test_release_requests
   where scope_id=p_scope) then
    raise exception 'Release request already exists' using errcode='55000'; end if;
 insert into public.btcpay_test_release_requests(
   scope_id,rule_id,rule_version,allocation_snapshot,audit_head_id,requested_by)
 values(p_scope,v_hold.rule_id,v_hold.rule_version,
        v_hold.allocation_snapshot,v_head,auth.uid()) returning id into v_request;
 return v_request;
end; $$;
revoke all on function public.request_btcpay_test_checkout_release(uuid)
 from PUBLIC,anon;
grant execute on function public.request_btcpay_test_checkout_release(uuid)
 to authenticated;

create function public.approve_btcpay_test_checkout_release(p_request uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_req public.btcpay_test_release_requests%rowtype;
begin
 if auth.uid() is null or
   coalesce(auth.jwt()->'app_metadata'->>'apex_role','')<>'platform_admin' or
   not exists(select 1 from public.apex_admin_memberships m
     where m.user_id=auth.uid()) then
    raise exception 'Verified administrator required' using errcode='42501';
 end if;
 if p_request is null then
   raise exception 'Missing release request' using errcode='22023'; end if;
 select * into v_req from public.btcpay_test_release_requests
    where id=p_request;
 if not found then raise exception 'Unknown release request'
   using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storefront:'||v_req.scope_id::text,0));
 select * into v_req from public.btcpay_test_release_requests
   where id=p_request for update;
 if v_req.requested_by=auth.uid() then
    raise exception 'Second independent administrator required'
      using errcode='42501'; end if;
 if exists(select 1 from public.btcpay_test_release_approvals
   where scope_id=v_req.scope_id or request_id=p_request) then
   raise exception 'Release already approved' using errcode='55000'; end if;
 if not apex_test_internal.test_release_evidence_current(
   v_req.scope_id,v_req.rule_id,v_req.rule_version,
   v_req.allocation_snapshot,v_req.audit_head_id) then
   raise exception 'Release evidence changed; do not resume checkout'
     using errcode='55000'; end if;
 insert into public.btcpay_test_release_approvals(
   scope_id,request_id,rule_id,rule_version,allocation_snapshot,
   audit_head_id,approved_by)
 values(v_req.scope_id,v_req.id,v_req.rule_id,v_req.rule_version,
        v_req.allocation_snapshot,v_req.audit_head_id,auth.uid());
 return 'synthetic_release_signed_no_real_checkout';
end; $$;
revoke all on function public.approve_btcpay_test_checkout_release(uuid)
 from PUBLIC,anon;
grant execute on function public.approve_btcpay_test_checkout_release(uuid)
 to authenticated;

-- A read-only simulation of the trusted test invoice writer's gate.
-- The original PR #120 trigger is left UNCHANGED: a held store still blocks
-- every actual INSERT, even if the synthetic dual-control record exists.
-- No production checkout can call this internal function.
create function apex_test_internal.preview_btcpay_test_checkout_resume(p_scope uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
 v_req public.btcpay_test_release_requests%rowtype;
 v_signed public.btcpay_test_release_approvals%rowtype;
begin
 if p_scope is null then return 'blocked_missing_scope'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||p_scope::text,0));
 select * into v_signed from public.btcpay_test_release_approvals
    where scope_id=p_scope;
 if not found then return 'blocked_unsigned'; end if;
 select * into v_req from public.btcpay_test_release_requests
    where id=v_signed.request_id and scope_id=p_scope;
 if not found or v_req.requested_by=v_signed.approved_by or
   v_req.rule_id is distinct from v_signed.rule_id or
   v_req.rule_version is distinct from v_signed.rule_version or
   v_req.audit_head_id is distinct from v_signed.audit_head_id or
   v_req.allocation_snapshot is distinct from v_signed.allocation_snapshot then
   return 'blocked_invalid_dual_control';
 end if;
 if not apex_test_internal.test_release_evidence_current(
   v_signed.scope_id,v_signed.rule_id,v_signed.rule_version,
   v_signed.allocation_snapshot,v_signed.audit_head_id) then
   return 'blocked_stale_evidence';
 end if;
 return 'simulation_ready_hold_remains_active';
end; $$;
revoke all on function apex_test_internal.preview_btcpay_test_checkout_resume(uuid)
 from PUBLIC,anon,authenticated;
commit;
