-- Real disposable upstream BTCPay/Greenfield trusted-worker test.
-- Apply ONLY after isolated schema & review-only fixture tables in apex_test.
-- Provider store ID is passed by loopback Greenfield bootstrap via -v.
\set ON_ERROR_STOP on
begin;
insert into public.apex_admin_memberships(user_id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.payout_recipients(
 id,display_name,recipient_type,status) values
 ('10000000-0000-0000-0000-000000000001','Regtest supplier','supplier','active'),
 ('10000000-0000-0000-0000-000000000002','Regtest platform','platform','active');
with supplier as (
 insert into public.suppliers(slug,display_name)
 values('worker-regtest-supplier','Disposable Greenfield supplier')
 returning id
)
insert into public.stores(id,supplier_id,slug,display_name,is_public)
select '39500000-0000-0000-0000-000000000001',id,
 'trusted-real-greenfield','Disposable worker store',false from supplier;
insert into public.payout_rules(
 id,scope_type,scope_id,version,status,effective_from)
values('29500000-0000-0000-0000-000000000001','storefront',
 '39500000-0000-0000-0000-000000000001',1,'draft',now());
insert into public.payout_rule_allocations(
 rule_id,recipient_id,basis_points) values
 ('29500000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',9000),
 ('29500000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',1000);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
 '29500000-0000-0000-0000-000000000001')<>
 'approved_pending_manual_sync' then
 raise exception 'Real regtest provider fixture review was not eligible';
 end if;
end $$;
commit;

do $$
declare
 s uuid:='39500000-0000-0000-0000-000000000001';
 r uuid:='29500000-0000-0000-0000-000000000001';
begin
 if apex_test_internal.hold_btcpay_test_split_sync(r)<>
 'held_no_provider_sync' then
 raise exception 'Could not acquire immutable regtest provider hold';
 end if;
 perform apex_test_internal.record_btcpay_test_recovery_event(
 s,r,'real_provider_success_001','external_change_reported_success',repeat('a',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
 s,r,'real_provider_readback_01','provider_readback_verified',repeat('b',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
 s,r,'real_provider_wallet_0001','wallet_reconciliation_verified',repeat('c',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
 s,r,'real_provider_operator_01','operator_release_reviewed',repeat('d',64));
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.request_btcpay_test_checkout_release(
 '39500000-0000-0000-0000-000000000001');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare id uuid;
begin
 select r.id into id from public.btcpay_test_release_requests r
 where r.scope_id='39500000-0000-0000-0000-000000000001';
 if public.approve_btcpay_test_checkout_release(id)<>
 'synthetic_release_signed_no_real_checkout' then
 raise exception 'Second independent regtest release signature missing';
 end if;
end $$;
commit;
select apex_test_internal.open_btcpay_test_checkout_resume(
 '39500000-0000-0000-0000-000000000001');

insert into public.btcpay_test_trusted_post_store_bindings(
 scope_id,btcpay_store_id,network) values
 ('39500000-0000-0000-0000-000000000001',:'store_id','regtest');

-- Even though a one-shot external intent can be reserved, the journal hold
-- prevents direct user-facing invoice registration without a separate permit.
do $$
begin
 if not exists(select 1 from public.btcpay_test_split_sync_holds
 where scope_id='39500000-0000-0000-0000-000000000001'
 and status='held') then
 raise exception 'Test synchronization hold unexpectedly released';
 end if;
end $$;
