-- PR #124 synthetic, disposable PostgreSQL only. Runs after PR #123.
-- One permit is one successful *journal* registration, not a BTCPay invoice.
\set ON_ERROR_STOP on

insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select v.scope,s.id,v.slug,v.label,false from public.suppliers s
 cross join (values
  ('37000000-0000-0000-0000-000000000001'::uuid,'resume-once','One-shot regtest fixture'),
  ('37000000-0000-0000-0000-000000000002'::uuid,'resume-incident','Revocation regtest fixture'),
  ('37000000-0000-0000-0000-000000000003'::uuid,'resume-races','Racing writers regtest fixture')
 ) v(scope,slug,label) where s.slug='test-supplier';

insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values
 ('27000000-0000-0000-0000-000000000001','storefront',
  '37000000-0000-0000-0000-000000000001',1,'draft',now()),
 ('27000000-0000-0000-0000-000000000002','storefront',
  '37000000-0000-0000-0000-000000000002',1,'draft',now()),
 ('27000000-0000-0000-0000-000000000003','storefront',
  '37000000-0000-0000-0000-000000000003',1,'draft',now());

insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
select r.id,valueset.recipient_id,valueset.bps
from public.payout_rules r cross join (values
 ('10000000-0000-0000-0000-000000000001'::uuid,9000),
 ('10000000-0000-0000-0000-000000000002'::uuid,1000)
) valueset(recipient_id,bps)
where r.id in ('27000000-0000-0000-0000-000000000001',
 '27000000-0000-0000-0000-000000000002',
 '27000000-0000-0000-0000-000000000003');

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
  '27000000-0000-0000-0000-000000000001'::uuid,
  '27000000-0000-0000-0000-000000000002'::uuid,
  '27000000-0000-0000-0000-000000000003'::uuid
 ] loop
   if public.review_btcpay_test_split_activation(v_rule)
       <> 'approved_pending_manual_sync' then
     raise exception 'Fixture split not admin reviewed';
   end if;
 end loop;
end $$;
commit;

select apex_test_internal.hold_btcpay_test_split_sync(
  '27000000-0000-0000-0000-000000000001');
select apex_test_internal.hold_btcpay_test_split_sync(
  '27000000-0000-0000-0000-000000000002');
select apex_test_internal.hold_btcpay_test_split_sync(
  '27000000-0000-0000-0000-000000000003');

do $$
declare
 v_scope uuid;
 v_rule uuid;
 v_label text;
begin
 for v_scope,v_rule,v_label in
  select * from (values
   ('37000000-0000-0000-0000-000000000001'::uuid,
    '27000000-0000-0000-0000-000000000001'::uuid,'once'),
   ('37000000-0000-0000-0000-000000000002'::uuid,
    '27000000-0000-0000-0000-000000000002'::uuid,'incident'),
   ('37000000-0000-0000-0000-000000000003'::uuid,
    '27000000-0000-0000-0000-000000000003'::uuid,'races')
  ) as x(scope,rule_id,label)
 loop
  perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_change_ok_0001',
    'external_change_reported_success',repeat('a',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_readback_ok_01',
    'provider_readback_verified',repeat('b',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_wallet_ok_00001',
    'wallet_reconciliation_verified',repeat('c',64));
  perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_operator_ok_01',
    'operator_release_reviewed',repeat('d',64));
 end loop;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_scope uuid;
begin
 foreach v_scope in array array[
  '37000000-0000-0000-0000-000000000001'::uuid,
  '37000000-0000-0000-0000-000000000002'::uuid,
  '37000000-0000-0000-0000-000000000003'::uuid
 ] loop
  if public.request_btcpay_test_checkout_release(v_scope) is null then
    raise exception 'Missing synthetic release request'; end if;
 end loop;
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_request uuid;
begin
 for v_request in select id from public.btcpay_test_release_requests
  where scope_id in (
   '37000000-0000-0000-0000-000000000001',
   '37000000-0000-0000-0000-000000000002')
 loop
  if public.approve_btcpay_test_checkout_release(v_request)
      <> 'synthetic_release_signed_no_real_checkout' then
    raise exception 'Distinct admin signature missing'; end if;
 end loop;
end $$;
commit;

-- No resume permit: held despite both administrator approvals.
do $$
declare v_rejected boolean:=false;
begin
 begin
  insert into public.btcpay_test_invoices(
    apex_store_id,btcpay_store_id,invoice_id,order_reference,
    expected_amount_cents,bitcoin_network)
  values('37000000-0000-0000-0000-000000000001',
    'once-regtest','no-permit-inv','no-permit-order',100,'regtest');
 exception when sqlstate '55000' then v_rejected:=true; end;
 if not v_rejected then
  raise exception 'Two signers bypassed the explicit operator permit'; end if;
end $$;

-- One signed, operator-issued disposable registration permit.
select apex_test_internal.open_btcpay_test_checkout_resume(
 '37000000-0000-0000-0000-000000000001');

-- Explicit testnet request is rejected even though the one-shot regtest
-- permit is OPEN, and a failed INSERT cannot consume the permit.
do $$
declare v_denied boolean:=false;
begin
 begin
  insert into public.btcpay_test_invoices(
   apex_store_id,btcpay_store_id,invoice_id,order_reference,
   expected_amount_cents,bitcoin_network)
  values('37000000-0000-0000-0000-000000000001',
    'once-regtest','testnet-denied','testnet-order',100,'testnet');
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'Testnet request bypassed regtest permit'; end if;
 if (select status from public.btcpay_test_checkout_resume_permits
  where scope_id='37000000-0000-0000-0000-000000000001')<>'open'
 then raise exception 'Failed journal INSERT consumed permit'; end if;
end $$;

insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network)
values('37000000-0000-0000-0000-000000000001',
  'once-regtest','only-regtest-invoice','only-regtest-order',1000,'regtest');

do $$
declare v_denied boolean:=false;
begin
 if (select status from public.btcpay_test_checkout_resume_permits
   where scope_id='37000000-0000-0000-0000-000000000001')<>'consumed' then
    raise exception 'Successful journal INSERT did not atomically reblock'; end if;
 begin
  insert into public.btcpay_test_invoices(
    apex_store_id,btcpay_store_id,invoice_id,order_reference,
    expected_amount_cents,bitcoin_network)
  values('37000000-0000-0000-0000-000000000001',
    'once-regtest','second-denied','second-order',100,'regtest');
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'Consumed permit accepted second invoice'; end if;
end $$;

select apex_test_internal.open_btcpay_test_checkout_resume(
 '37000000-0000-0000-0000-000000000002');
select apex_test_internal.record_btcpay_test_recovery_event(
 '37000000-0000-0000-0000-000000000002',
 '27000000-0000-0000-0000-000000000002',
 'late_unknown_regtest_001','external_change_unknown',repeat('e',64));

do $$
declare v_denied boolean:=false;
begin
 if (select status from public.btcpay_test_checkout_resume_permits
   where scope_id='37000000-0000-0000-0000-000000000002')<>'revoked' then
    raise exception 'New provider incident did not revoke open permit'; end if;
 begin
  insert into public.btcpay_test_invoices(
   apex_store_id,btcpay_store_id,invoice_id,order_reference,
   expected_amount_cents,bitcoin_network)
  values('37000000-0000-0000-0000-000000000002',
    'incident-regtest','incident-must-block','incident-order',100,'regtest');
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'Revoked permit allowed journal INSERT'; end if;
 begin
  update public.btcpay_test_checkout_resume_permits
    set status='open',terminal_at=null
    where scope_id='37000000-0000-0000-0000-000000000002';
  raise exception 'Terminal permit was reopened';
 exception when sqlstate '55000' then null; end;
 if (select count(*) from public.btcpay_test_split_sync_holds
   where scope_id in(
    '37000000-0000-0000-0000-000000000001',
    '37000000-0000-0000-0000-000000000002') and status='held')<>2 then
    raise exception 'Original immutable hold was modified'; end if;
 if exists(select 1 from public.payout_rules
    where id in ('27000000-0000-0000-0000-000000000001',
       '27000000-0000-0000-0000-000000000002')
       and status<>'draft') then
    raise exception 'Synthetic checkout resume activated actual split rule'; end if;
end $$;

do $$
begin
 if has_table_privilege('authenticated',
  'public.btcpay_test_checkout_resume_permits','INSERT') or
  has_table_privilege('authenticated',
  'public.btcpay_test_checkout_resume_permits','UPDATE') or
  has_function_privilege('authenticated',
  'apex_test_internal.open_btcpay_test_checkout_resume(uuid)','EXECUTE') then
   raise exception 'Browser can bypass checkout resume operator gate'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"supplier"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_checkout_resume_permits)<>0 then
   raise exception 'Supplier can inspect release permit history'; end if;
end $$;
rollback;

-- Store 3 remains signed by only the first admin and unpermitted, so
-- the next two-session race checks can prove approval/insert serialization.
do $$
begin
 if apex_test_internal.preview_btcpay_test_checkout_resume(
   '37000000-0000-0000-0000-000000000003') <> 'blocked_unsigned' then
   raise exception 'Race fixture must start without second signature'; end if;
 if exists(select 1 from public.btcpay_test_checkout_resume_permits
    where scope_id='37000000-0000-0000-0000-000000000003') then
   raise exception 'Race fixture already has a permit'; end if;
end $$;
