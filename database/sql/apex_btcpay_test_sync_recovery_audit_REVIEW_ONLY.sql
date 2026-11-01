-- PR #122. DISPOSABLE PostgreSQL TEST ONLY. NEVER hosted migration.
-- Append-only audit of a checkout-hold recovery REVIEW, not an unhold action.
-- No BTCPay or Prism configuration changes, signing, payouts or live checkout.
begin;

create table public.btcpay_test_sync_recovery_events (
 id bigint generated always as identity primary key,
 scope_id uuid not null references public.btcpay_test_split_sync_holds(scope_id)
   on delete restrict,
 rule_id uuid not null references public.payout_rules(id) on delete restrict,
 request_id text not null check(request_id ~ '^[A-Za-z0-9_-]{8,100}$'),
 kind text not null check(kind in (
  'provider_inventory_checked',
  'external_change_unknown',
  'external_change_failed',
  'external_change_reported_success',
  'provider_readback_verified',
  'wallet_reconciliation_verified',
  'operator_release_reviewed',
  'release_review_denied'
 )),
 -- SHA256 digest of evidence retained OUTSIDE this fixture, never the
 -- provider tokens, wallet addresses or raw invoice/claim identities.
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique (scope_id,request_id)
);
create index btcpay_test_recovery_scope_history_idx
 on public.btcpay_test_sync_recovery_events(scope_id,id);

alter table public.btcpay_test_sync_recovery_events enable row level security;
revoke all on public.btcpay_test_sync_recovery_events
 from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_sync_recovery_events to authenticated;
create policy btcpay_test_recovery_admin_read
 on public.btcpay_test_sync_recovery_events for select to authenticated
 using (exists(select 1 from public.apex_admin_memberships a
               where a.user_id=(select auth.uid())));

-- Trigger blocks UPDATE and DELETE even for privileged database operators.
create trigger btcpay_test_recovery_events_immutable
 before update or delete on public.btcpay_test_sync_recovery_events
 for each row execute function apex_test_internal.block_test_receipt_mutation();

-- Privileged SQL fixture writer only. This does not verify evidence origin.
-- All mutations share the PR #119/120 storefront advisory transaction lock.
-- Duplicate retries must match exact data and return the original ID; a
-- reused request ID with different evidence is rejected.
create function apex_test_internal.record_btcpay_test_recovery_event(
 p_scope_id uuid, p_rule_id uuid, p_request_id text,
 p_kind text, p_evidence_sha256 text)
returns bigint language plpgsql security invoker
set search_path=pg_catalog as $$
declare
 v_hold public.btcpay_test_split_sync_holds%rowtype;
 v_prior public.btcpay_test_sync_recovery_events%rowtype;
 v_id bigint;
begin
 if p_scope_id is null or p_rule_id is null or
    p_request_id is null or
    p_request_id !~ '^[A-Za-z0-9_-]{8,100}$' or
    p_kind not in (
     'provider_inventory_checked','external_change_unknown',
     'external_change_failed','external_change_reported_success',
     'provider_readback_verified','wallet_reconciliation_verified',
     'operator_release_reviewed','release_review_denied') or
    p_kind is null or
    p_evidence_sha256 is null or
    p_evidence_sha256 !~ '^[0-9a-f]{64}$'
 then
   raise exception 'Invalid synthetic audit event' using errcode='22023';
 end if;

 perform pg_advisory_xact_lock(
   hashtextextended('storefront:'||p_scope_id::text,0));
 select * into v_hold from public.btcpay_test_split_sync_holds
   where scope_id=p_scope_id;
 if not found or v_hold.status<>'held' or
    v_hold.rule_id is distinct from p_rule_id then
   raise exception 'No matching active test sync hold'
     using errcode='55000';
 end if;
 select * into v_prior from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope_id and request_id=p_request_id;
 if found then
   if v_prior.rule_id is distinct from p_rule_id or
      v_prior.kind is distinct from p_kind or
      v_prior.evidence_sha256 is distinct from p_evidence_sha256 then
     raise exception 'Conflicting recovery event retry'
       using errcode='23505';
   end if;
   return v_prior.id;
 end if;
 insert into public.btcpay_test_sync_recovery_events(
   scope_id,rule_id,request_id,kind,evidence_sha256
 ) values(p_scope_id,p_rule_id,p_request_id,p_kind,p_evidence_sha256)
 returning id into v_id;
 return v_id;
end; $$;
revoke all on function apex_test_internal.record_btcpay_test_recovery_event(
 uuid,uuid,text,text,text) from PUBLIC,anon,authenticated;

-- A read-only, non-authorizing assessment. It recognizes one exact ordered
-- synthetic sequence with no subsequent incidents. A successful result is
-- explicitly NOT checkout release, not permission to change Prism.
-- No Web API or authenticated browser can call it.
create function apex_test_internal.assess_btcpay_test_release_readiness(
 p_scope_id uuid)
returns text language plpgsql security invoker
set search_path=pg_catalog as $$
declare
 v_hold public.btcpay_test_split_sync_holds%rowtype;
 v_last bigint;
 v_change bigint;
 v_readback bigint;
 v_wallet bigint;
 v_operator bigint;
 v_bad bigint;
begin
 if p_scope_id is null then
  raise exception 'Missing scope' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(
   hashtextextended('storefront:'||p_scope_id::text,0));
 select * into v_hold from public.btcpay_test_split_sync_holds
   where scope_id=p_scope_id;
 if not found or v_hold.status<>'held' then
  return 'blocked_missing_hold';
 end if;
 -- Any unknown/failed/denied event since the most recent reported-successful
 -- change invalidates the proposed readiness until a new reviewed attempt.
 select max(id) into v_change from public.btcpay_test_sync_recovery_events
  where scope_id=p_scope_id and rule_id=v_hold.rule_id
    and kind='external_change_reported_success';
 if v_change is null then return 'blocked_no_reported_change'; end if;
 select min(id) into v_bad from public.btcpay_test_sync_recovery_events
  where scope_id=p_scope_id and id>v_change
    and kind in('external_change_unknown','external_change_failed',
                 'release_review_denied');
 if v_bad is not null then return 'blocked_incident_after_change'; end if;
 select min(id) into v_readback from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope_id and rule_id=v_hold.rule_id
     and kind='provider_readback_verified' and id>v_change;
 if v_readback is null then return 'blocked_missing_provider_readback'; end if;
 select min(id) into v_wallet from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope_id and rule_id=v_hold.rule_id
     and kind='wallet_reconciliation_verified' and id>v_readback;
 if v_wallet is null then return 'blocked_missing_wallet_reconciliation'; end if;
 select min(id) into v_operator from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope_id and rule_id=v_hold.rule_id
     and kind='operator_release_reviewed' and id>v_wallet;
 if v_operator is null then return 'blocked_missing_operator_review'; end if;
 -- Any subsequent reported configuration change makes the evidence stale.
 select max(id) into v_last from public.btcpay_test_sync_recovery_events
   where scope_id=p_scope_id and kind='external_change_reported_success';
 if v_last<>v_change then return 'blocked_newer_change'; end if;
 return 'review_only_candidate_checkout_stays_held';
end; $$;
revoke all on function apex_test_internal.assess_btcpay_test_release_readiness(uuid)
 from PUBLIC,anon,authenticated;
commit;
