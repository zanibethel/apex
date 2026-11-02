-- PR #120. Disposable SQL fixture, after PR #119 admin review tests.
-- A hold blocks new test invoice registrations WITHOUT touching Prism.
begin;
select apex_test_internal.hold_btcpay_test_split_sync(
 '21000000-0000-0000-0000-000000000019');

do $$
declare v_rejected boolean:=false;
begin
 if (select count(*) from public.btcpay_test_split_sync_holds
  where scope_id='30000000-0000-0000-0000-000000000001'
    and rule_version=119 and status='held'
    and rule_id='21000000-0000-0000-0000-000000000019')<>1 then
  raise exception 'Expected one immutable held candidate';
 end if;
 if (select status from public.payout_rules
  where id='21000000-0000-0000-0000-000000000019')<>'draft' then
  raise exception 'Holding a candidate changed a live payout rule';
 end if;
 begin
  insert into public.btcpay_test_invoices(
    apex_store_id,btcpay_store_id,invoice_id,order_reference,
    expected_amount_cents,bitcoin_network
  ) values (
    '30000000-0000-0000-0000-000000000001','activation-store-regtest',
    'invoice-must-block-1','order-must-block-1',1000,'regtest');
 exception when sqlstate '55000' then v_rejected:=true; end;
 if not v_rejected then
   raise exception 'Invoice was registered during a sync hold';
 end if;
 if exists(select 1 from public.btcpay_test_invoices
  where invoice_id='invoice-must-block-1') then
  raise exception 'Blocked invoice persisted';
 end if;
end $$;
commit;

-- A different storefront without a hold remains writable by its trusted
-- fixture writer. Never a hosted invoice, never a payment or signed webhook.
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network
) values (
 '33000000-0000-0000-0000-000000000002','other-activation-store',
 'unheld-invoice-1','unheld-order-1',5000,'regtest'
);

-- A review can become stale: a NEW invoice after review must block the
-- second, independent trusted synchronization hold recheck.
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select '34000000-0000-0000-0000-000000000001',s.id,
 'review-stale-test','Stale split review fixture',false
 from public.suppliers s where slug='test-supplier';
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values('24000000-0000-0000-0000-000000000001','storefront',
 '34000000-0000-0000-0000-000000000001',1,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
values
 ('24000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',9000),
 ('24000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1000);
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
   '24000000-0000-0000-0000-000000000001') <>
    'approved_pending_manual_sync' then
  raise exception 'Expected clean synthetic candidate';
 end if;
end $$;
commit;

insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network
) values (
 '34000000-0000-0000-0000-000000000001','stale-approval-store',
 'stale-invoice-1','stale-order-1',5000,'regtest'
);
do $$
declare v_rejected boolean:=false;
begin
 begin
  perform apex_test_internal.hold_btcpay_test_split_sync(
   '24000000-0000-0000-0000-000000000001');
 exception when sqlstate '55000' then v_rejected:=true; end;
 if not v_rejected then
  raise exception 'Stale review bypassed outstanding invoice barrier';
 end if;
 if exists(select 1 from public.btcpay_test_split_sync_holds
   where scope_id='34000000-0000-0000-0000-000000000001') then
  raise exception 'Stale review unexpectedly created a hold';
 end if;
end $$;

-- A previously established hold cannot be deleted or replaced and no user
-- session may invoke the privileged hold function.
do $$
declare v_rejected boolean:=false;
begin
 if has_function_privilege('authenticated',
     'apex_test_internal.hold_btcpay_test_split_sync(uuid)','EXECUTE') or
    has_function_privilege('anon',
     'apex_test_internal.hold_btcpay_test_split_sync(uuid)','EXECUTE') then
  raise exception 'Browser can create synchronization hold';
 end if;
 if has_table_privilege('authenticated',
   'public.btcpay_test_split_sync_holds','INSERT') or
    has_table_privilege('authenticated',
   'public.btcpay_test_split_sync_holds','UPDATE') then
  raise exception 'Browser can mutate synchronization hold';
 end if;
 begin
  delete from public.btcpay_test_split_sync_holds
   where scope_id='30000000-0000-0000-0000-000000000001';
 exception when sqlstate '55000' then v_rejected:=true; end;
 if not v_rejected then raise exception 'Hold could be deleted'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_split_sync_holds)<>1 then
  raise exception 'Admin cannot read its held candidate';
 end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"supplier"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_split_sync_holds)<>0 then
  raise exception 'Supplier read privileged sync hold';
 end if;
end $$;
rollback;
