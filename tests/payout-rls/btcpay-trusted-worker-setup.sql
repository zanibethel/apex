-- PR #126: two isolated stores, fresh dual authorization and permit.
-- Trusted worker tests only: no real BTCPay API key or network access.
\set ON_ERROR_STOP on
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select v.scope,s.id,v.slug,v.label,false from public.suppliers s
 cross join (values
  ('39000000-0000-0000-0000-000000000001'::uuid,'trusted-worker-ok','Trusted worker success fixture'),
  ('39000000-0000-0000-0000-000000000002'::uuid,'trusted-worker-unknown','Trusted worker timeout fixture')
 ) v(scope,slug,label) where s.slug='test-supplier';

insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values
 ('29000000-0000-0000-0000-000000000001','storefront',
  '39000000-0000-0000-0000-000000000001',1,'draft',now()),
 ('29000000-0000-0000-0000-000000000002','storefront',
  '39000000-0000-0000-0000-000000000002',1,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
 select p.id,v.recipient,v.bps from public.payout_rules p
 cross join (values
  ('10000000-0000-0000-0000-000000000001'::uuid,9000),
  ('10000000-0000-0000-0000-000000000002'::uuid,1000)
 ) v(recipient,bps)
 where p.id in ('29000000-0000-0000-0000-000000000001',
                '29000000-0000-0000-0000-000000000002');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_rule uuid;
begin
 foreach v_rule in array array[
  '29000000-0000-0000-0000-000000000001'::uuid,
  '29000000-0000-0000-0000-000000000002'::uuid] loop
  if public.review_btcpay_test_split_activation(v_rule)
    <> 'approved_pending_manual_sync' then
     raise exception 'Missing fixture admin review';
  end if;
 end loop;
end $$;
commit;

select apex_test_internal.hold_btcpay_test_split_sync(
 '29000000-0000-0000-0000-000000000001');
select apex_test_internal.hold_btcpay_test_split_sync(
 '29000000-0000-0000-0000-000000000002');

do $$
declare s uuid; r uuid; label text;
begin
 for s,r,label in select * from (values
  ('39000000-0000-0000-0000-000000000001'::uuid,
   '29000000-0000-0000-0000-000000000001'::uuid,'worker_ok'),
  ('39000000-0000-0000-0000-000000000002'::uuid,
   '29000000-0000-0000-0000-000000000002'::uuid,'worker_timeout')
 ) v(scope,rule_id,txt)
 loop
  perform apex_test_internal.record_btcpay_test_recovery_event(
    s,r,label||'_success_0001','external_change_reported_success',repeat('a',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    s,r,label||'_readback_001','provider_readback_verified',repeat('b',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    s,r,label||'_wallet_00001','wallet_reconciliation_verified',repeat('c',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    s,r,label||'_operator_001','operator_release_reviewed',repeat('d',64));
 end loop;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.request_btcpay_test_checkout_release(
 '39000000-0000-0000-0000-000000000001');
select public.request_btcpay_test_checkout_release(
 '39000000-0000-0000-0000-000000000002');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare req uuid;
begin
 for req in select id from public.btcpay_test_release_requests
 where scope_id in('39000000-0000-0000-0000-000000000001',
                   '39000000-0000-0000-0000-000000000002') loop
  if public.approve_btcpay_test_checkout_release(req)
    <> 'synthetic_release_signed_no_real_checkout' then
    raise exception 'Independent approval missing';
  end if;
 end loop;
end $$;
commit;

select apex_test_internal.open_btcpay_test_checkout_resume(
 '39000000-0000-0000-0000-000000000001');
select apex_test_internal.open_btcpay_test_checkout_resume(
 '39000000-0000-0000-0000-000000000002');
insert into public.btcpay_test_trusted_post_store_bindings(
 scope_id,btcpay_store_id,network)
values
 ('39000000-0000-0000-0000-000000000001','trusted-synthetic-store-ok','regtest'),
 ('39000000-0000-0000-0000-000000000002','trusted-synthetic-store-timeout','regtest');

-- Cross-store binding must reject a reservation without consuming either permit.
do $$
declare denied boolean:=false;
begin
 begin
  perform apex_test_internal.reserve_btcpay_test_provider_post(
   '39000000-0000-0000-0000-000000000001',
   'trusted-synthetic-store-timeout','cross-store-blocked',10000);
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Wrong BTCPay store was accepted'; end if;
 if (select status from public.btcpay_test_checkout_resume_permits
  where scope_id='39000000-0000-0000-0000-000000000001')<>'open'
 then raise exception 'Rejected store binding consumed permit'; end if;
end $$;
