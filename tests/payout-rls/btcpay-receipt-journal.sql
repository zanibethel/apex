-- Disposable PostgreSQL regression: requires payout fixture + check.sh's seeded admin.
-- All IDs and hashes below are synthetic, never real payment credentials.
insert into public.suppliers(id,slug,display_name) values
 ('51000000-0000-0000-0000-000000000001','btcpay-test-alpha','Test Alpha'),
 ('51000000-0000-0000-0000-000000000002','btcpay-test-beta','Test Beta');
insert into public.stores(id,supplier_id,slug,display_name) values
 ('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','btcpay-test-alpha','Test Alpha'),
 ('52000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','btcpay-test-beta','Test Beta');

insert into public.btcpay_test_invoices
 (apex_store_id,btcpay_store_id,invoice_id,order_reference,
  expected_amount_cents,bitcoin_network) values
 ('52000000-0000-0000-0000-000000000001','test-store-alpha','invoice-alpha','order-alpha',1005,'regtest'),
 ('52000000-0000-0000-0000-000000000002','test-store-beta','invoice-beta','order-beta',1500,'testnet');

insert into public.btcpay_test_webhook_receipts
 (btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256) values
 ('test-store-alpha','delivery-1','invoice-alpha','InvoiceSettled',repeat('a',64)),
 ('test-store-beta','delivery-1','invoice-beta','InvoiceProcessing',repeat('b',64));

-- Same delivery ID across DIFFERENT stores is valid; within one store it is not.
insert into public.btcpay_test_webhook_receipts
 (btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256)
 values ('test-store-alpha','delivery-1','invoice-alpha','InvoiceSettled',repeat('a',64))
 on conflict (btcpay_store_id,delivery_id) do nothing;

insert into public.btcpay_test_invoice_observations
 (btcpay_store_id,delivery_id,invoice_id,invoice_status,additional_status,assessment) values
 ('test-store-alpha','delivery-1','invoice-alpha','Settled','None','settled_invoice_reported'),
 ('test-store-beta','delivery-1','invoice-beta','Processing','PaidPartial','exception_manual_review');

do $$
declare v_count integer;
begin
 select count(*) into v_count from public.btcpay_test_webhook_receipts;
 if v_count<>2 then raise exception 'duplicate webhook created extra rows'; end if;
 select count(*) into v_count from public.btcpay_test_invoice_observations;
 if v_count<>2 then raise exception 'observation count mismatch'; end if;
 if (select payload_sha256 from public.btcpay_test_webhook_receipts
     where btcpay_store_id='test-store-alpha' and delivery_id='delivery-1') <> repeat('a',64)
 then raise exception 'replay silently changed accepted payload hash'; end if;
 if (select count(*) from public.btcpay_test_invoices)<>2 then
   raise exception 'unexpected invoice count'; end if;
end $$;

-- Duplicate invoice IDs, repeated order refs, conflicting deliveries must fail.
do $$
declare rejected boolean;
begin
 rejected:=false;
 begin
   insert into public.btcpay_test_invoices
    (apex_store_id,btcpay_store_id,invoice_id,order_reference,expected_amount_cents,bitcoin_network)
    values ('52000000-0000-0000-0000-000000000001','test-store-alpha','invoice-alpha',
            'other-order',1100,'regtest');
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'duplicate invoice accepted'; end if;

 rejected:=false;
 begin
   insert into public.btcpay_test_webhook_receipts
    (btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256)
    values ('test-store-alpha','delivery-1','invoice-alpha','InvoiceSettled',repeat('f',64));
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'conflicting delivery accepted'; end if;

 rejected:=false;
 begin
   insert into public.btcpay_test_webhook_receipts
    (btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256)
    values ('test-store-beta','wrong-invoice','invoice-alpha','InvoiceSettled',repeat('c',64));
 exception when foreign_key_violation then rejected:=true;
 end;
 if not rejected then raise exception 'cross-store invoice alias accepted'; end if;

 -- Use an unused delivery so the FK check, not the observation unique key,
 -- is the condition under test.
 insert into public.btcpay_test_webhook_receipts
  (btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256)
  values ('test-store-alpha','delivery-2','invoice-alpha','InvoiceSettled',repeat('d',64));

 rejected:=false;
 begin
   insert into public.btcpay_test_invoice_observations
    (btcpay_store_id,delivery_id,invoice_id,invoice_status,additional_status,assessment)
    values ('test-store-alpha','delivery-2','invoice-beta','Settled','None','settled_invoice_reported');
 exception when foreign_key_violation then rejected:=true;
 end;
 if not rejected then raise exception 'cross-invoice observation accepted'; end if;

 rejected:=false;
 begin
   insert into public.btcpay_test_invoice_observations
    (btcpay_store_id,delivery_id,invoice_id,invoice_status,additional_status,assessment)
    values ('test-store-alpha','delivery-2','invoice-alpha','Settled','PaidPartial','settled_invoice_reported');
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'invalid assessment accepted'; end if;
end $$;

do $$
declare rejected boolean;
begin
 rejected:=false;
 begin update public.btcpay_test_invoices
   set expected_amount_cents=1006 where invoice_id='invoice-alpha';
 exception when sqlstate '55000' then rejected:=true;
 end;
 if not rejected then raise exception 'invoice update was not blocked'; end if;
 rejected:=false;
 begin delete from public.btcpay_test_webhook_receipts
   where delivery_id='delivery-1' and btcpay_store_id='test-store-alpha';
 exception when sqlstate '55000' then rejected:=true;
 end;
 if not rejected then raise exception 'receipt delete was not blocked'; end if;
 rejected:=false;
 begin update public.btcpay_test_invoice_observations set assessment='invalid'
   where invoice_id='invoice-alpha';
 exception when sqlstate '55000' then rejected:=true;
 end;
 if not rejected then raise exception 'observation update was not blocked'; end if;
end $$;

do $$
declare tab text;
begin
 foreach tab in array array[
  'btcpay_test_invoices','btcpay_test_webhook_receipts',
  'btcpay_test_invoice_observations'] loop
   if has_table_privilege('anon','public.'||tab,'SELECT') then
      raise exception 'anonymous role can read %',tab; end if;
   if has_table_privilege('authenticated','public.'||tab,'INSERT') or
      has_table_privilege('authenticated','public.'||tab,'UPDATE') or
      has_table_privilege('authenticated','public.'||tab,'DELETE') then
      raise exception 'browser role can mutate %',tab; end if;
 end loop;
end $$;

-- Admin is explicitly seeded in the existing payout fixture.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
begin
 if (select count(*) from public.btcpay_test_invoices)<>2 or
    (select count(*) from public.btcpay_test_webhook_receipts)<>2 or
    (select count(*) from public.btcpay_test_invoice_observations)<>2 then
  raise exception 'admin cannot read full test journal'; end if;
end $$;
rollback;

-- Non-admin supplier must not see any test payment metadata.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$
begin
 if (select count(*) from public.btcpay_test_invoices)<>0 or
    (select count(*) from public.btcpay_test_webhook_receipts)<>0 or
    (select count(*) from public.btcpay_test_invoice_observations)<>0 then
  raise exception 'non-admin leaked BTCPay journal'; end if;
end $$;
rollback;
