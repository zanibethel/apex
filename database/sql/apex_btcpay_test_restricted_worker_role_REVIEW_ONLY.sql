-- PR #172: disposable GitHub Actions PostgreSQL only. NOT a Supabase migration.
-- Run as postgres AFTER approval, hold, intent and trusted-binding fixtures.
-- The password arrives from a temporary CI secret; never commit or print it.
\set ON_ERROR_STOP on
\if :{?worker_password}
\else
  \echo 'STOP: ephemeral worker password missing'
  \quit 3
\endif
begin;
create role apex_test_invoice_worker with
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  password :'worker_password';
-- The role does not inherit from postgres, authenticated or service_role.
grant connect on database apex_test to apex_test_invoice_worker;
grant usage on schema apex_test_internal to apex_test_invoice_worker;

-- Only these three fixed-purpose entry points can be executed by this role.
-- Original privileged functions and all table writes remain unavailable.
create function apex_test_internal.worker_reserve_btcpay_test_provider_post(
  p_scope uuid,p_store text,p_order text,p_amount_sats bigint)
returns uuid language sql security definer set search_path='' as $fn$
  select apex_test_internal.reserve_btcpay_test_provider_post(
    p_scope,p_store,p_order,p_amount_sats);
$fn$;
create function apex_test_internal.worker_verify_btcpay_test_provider_post(
  p_intent uuid,p_scope uuid)
returns text language sql security definer set search_path='' as $fn$
  select pg_catalog.json_build_object(
   'intentId',i.id,'storeId',i.btcpay_store_id,
   'orderRef',i.order_reference,'amountSats',i.amount_sats::text,
   'network',i.network,'status','reserved_before_post')::text
  from public.btcpay_test_provider_post_intents i
  join public.btcpay_test_checkout_resume_permits p
    on p.scope_id=i.scope_id and p.request_id=i.permit_request_id
    and p.audit_head_id=i.audit_head_id and p.status='consumed'
  join public.btcpay_test_trusted_post_store_bindings b
    on b.scope_id=i.scope_id and b.btcpay_store_id=i.btcpay_store_id
    and b.network='regtest'
  join public.btcpay_test_release_approvals a
    on a.scope_id=i.scope_id and a.audit_head_id=i.audit_head_id
  where i.id=p_intent and i.scope_id=p_scope
    and i.network='regtest'
    and i.audit_head_id=(select max(e.id)
       from public.btcpay_test_sync_recovery_events e
       where e.scope_id=i.scope_id)
    and apex_test_internal.test_release_evidence_current(
       i.scope_id,a.rule_id,a.rule_version,
       a.allocation_snapshot,a.audit_head_id);
$fn$;
create function apex_test_internal.worker_observe_btcpay_test_provider_post(
  p_intent uuid,p_kind text,p_invoice text)
returns text language sql security definer set search_path='' as $fn$
  select apex_test_internal.observe_btcpay_test_provider_post(
    p_intent,p_kind,p_invoice);
$fn$;

revoke all on function apex_test_internal.worker_reserve_btcpay_test_provider_post(
 uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function apex_test_internal.worker_verify_btcpay_test_provider_post(
 uuid,uuid) from public,anon,authenticated;
revoke all on function apex_test_internal.worker_observe_btcpay_test_provider_post(
 uuid,text,text) from public,anon,authenticated;
grant execute on function apex_test_internal.worker_reserve_btcpay_test_provider_post(
 uuid,text,text,bigint) to apex_test_invoice_worker;
grant execute on function apex_test_internal.worker_verify_btcpay_test_provider_post(
 uuid,uuid) to apex_test_invoice_worker;
grant execute on function apex_test_internal.worker_observe_btcpay_test_provider_post(
 uuid,text,text) to apex_test_invoice_worker;

-- Explicitly deny direct table access, even if future fixture grants change.
revoke all on public.btcpay_test_provider_post_intents,
 public.btcpay_test_provider_post_observations,
 public.btcpay_test_checkout_resume_permits,
 public.btcpay_test_split_sync_holds,
 public.btcpay_test_release_requests,
 public.btcpay_test_release_approvals,
 public.btcpay_test_sync_recovery_events,
 public.btcpay_test_trusted_post_store_bindings,
 public.btcpay_test_invoices,
 public.payout_rules,
 public.payout_rule_allocations
 from apex_test_invoice_worker;
-- No privilege to change fixtures or bypass RLS is granted.
commit;
