-- Disposable PostgreSQL only. Depends on PR #107 receipt fixture + review-only order SQL.
insert into public.btcpay_test_order_status(
  btcpay_store_id,invoice_id,order_reference,expected_amount_sats
) values
  ('test-store-alpha','invoice-alpha','order-alpha',10000),
  ('test-store-beta','invoice-beta','order-beta',15000);

-- A new authentic delivery updates the admin-visible status transactionally.
do $$
declare outcome text;
begin
  outcome:=apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-1','InvoiceProcessing',
    repeat('1',64),'order-alpha',10000,'Processing','None','regtest');
  if outcome<>'accepted' then raise exception 'processing delivery not accepted'; end if;
  if (select status from public.btcpay_test_order_status
      where invoice_id='invoice-alpha') <> 'processing'
    then raise exception 'processing status not saved'; end if;

  outcome:=apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-1','InvoiceProcessing',
    repeat('1',64),'order-alpha',10000,'Processing','None','regtest');
  if outcome<>'duplicate' then raise exception 'identical delivery not idempotent'; end if;
  if (select status_revision from public.btcpay_test_order_status
      where invoice_id='invoice-alpha') <> 1
    then raise exception 'identical replay modified status'; end if;
end $$;

do $$
declare rejected boolean;
begin
  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','sync-1','InvoiceProcessing',
      repeat('f',64),'order-alpha',10000,'Processing','None','regtest');
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'conflicting payload digest accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','sync-1','InvoiceSettled',
      repeat('1',64),'order-alpha',10000,'Settled','None','regtest');
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'conflicting event type accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-beta','invoice-alpha','wrong-store','InvoiceSettled',
      repeat('a',64),'order-alpha',10000,'Settled','None','regtest');
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'cross-store payment accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','wrong-amount','InvoiceSettled',
      repeat('a',64),'order-alpha',10001,'Settled','None','regtest');
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'mismatched satoshis accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','wrong-order','InvoiceSettled',
      repeat('a',64),'different-order',10000,'Settled','None','regtest');
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'wrong order ref accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','wrong-chain','InvoiceSettled',
      repeat('a',64),'order-alpha',10000,'Settled','None','mainnet');
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'mainnet event accepted'; end if;

  rejected:=false;
  begin
    perform apex_test_internal.record_verified_btcpay_event(
      'test-store-alpha','invoice-alpha','bad-provider-state','InvoiceSettled',
      repeat('a',64),'order-alpha',10000,'Processing','None','regtest');
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'unconfirmed settled event accepted'; end if;
end $$;

-- A real authenticated provider read may observe newer status than an older
-- event type; never trust the event name alone. Once settled, stale Processing
-- cannot regress the stored view.
do $$
begin
 if apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-2','InvoiceSettled',
    repeat('2',64),'order-alpha',10000,'Settled','None','regtest'
 ) <> 'accepted' then raise exception 'settled observation failed'; end if;
 if (select status from public.btcpay_test_order_status
     where invoice_id='invoice-alpha') <> 'settled_reported'
   then raise exception 'settlement not projected'; end if;
 if apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-3','InvoiceProcessing',
    repeat('3',64),'order-alpha',10000,'Processing','None','regtest'
 ) <> 'accepted' then raise exception 'stale observation not recorded'; end if;
 if (select status from public.btcpay_test_order_status
     where invoice_id='invoice-alpha') <> 'settled_reported'
   then raise exception 'stale event regressed settlement'; end if;
end $$;

-- Manually marked settlement/overpaid/late invoices must force sticky review.
do $$
begin
 if apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-4','InvoiceSettled',
    repeat('4',64),'order-alpha',10000,'Settled','Marked','regtest'
 ) <> 'accepted' then raise exception 'manual review observation failed'; end if;
 if (select status from public.btcpay_test_order_status
     where invoice_id='invoice-alpha') <> 'manual_review'
   then raise exception 'manual mark was treated as safe settlement'; end if;
 perform apex_test_internal.record_verified_btcpay_event(
    'test-store-alpha','invoice-alpha','sync-5','InvoiceSettled',
    repeat('5',64),'order-alpha',10000,'Settled','None','regtest');
 if (select status from public.btcpay_test_order_status
     where invoice_id='invoice-alpha') <> 'manual_review'
   then raise exception 'manual review was cleared by a later event'; end if;

 perform apex_test_internal.record_verified_btcpay_event(
    'test-store-beta','invoice-beta','beta-late','InvoiceExpired',
    repeat('6',64),'order-beta',15000,'Expired','PaidLate','regtest');
 if (select status from public.btcpay_test_order_status
     where invoice_id='invoice-beta') <> 'manual_review'
   then raise exception 'late payment was credited instead of reviewed'; end if;
end $$;

-- Rejected operations are atomic: no receipt, observation, status or history.
do $$
declare c1 int;c2 int;c3 int;
begin
 select count(*) into c1 from public.btcpay_test_webhook_receipts;
 select count(*) into c2 from public.btcpay_test_invoice_observations;
 select count(*) into c3 from public.btcpay_test_order_status_history;
 if c1<>9 or c2<>8 or c3<>6 then
   raise exception 'unexpected counts: receipts %, provider observations %, status history %',c1,c2,c3;
 end if;
 if (select status_revision from public.btcpay_test_order_status
     where invoice_id='invoice-alpha') <>5
   then raise exception 'alpha version drift'; end if;
 if (select status_revision from public.btcpay_test_order_status
     where invoice_id='invoice-beta') <>1
   then raise exception 'beta version drift'; end if;
 if (select count(*) from public.btcpay_test_order_status_history
      where display_status='settled_reported')<>2
   then raise exception 'unexpected settlement status history'; end if;
end $$;

do $$
declare rejected boolean;
begin
 rejected:=false;
 begin
   update public.btcpay_test_order_status set expected_amount_sats=99999
   where invoice_id='invoice-alpha';
 exception when sqlstate '55000' then rejected:=true; end;
 if not rejected then raise exception 'trusted original order amount was rewritten'; end if;
 rejected:=false;
 begin
   delete from public.btcpay_test_order_status
   where invoice_id='invoice-alpha';
 exception when sqlstate '55000' then rejected:=true; end;
 if not rejected then raise exception 'order status was deleted'; end if;
 rejected:=false;
 begin
   update public.btcpay_test_order_status_history
   set display_status='awaiting' where invoice_id='invoice-alpha';
 exception when sqlstate '55000' then rejected:=true; end;
 if not rejected then raise exception 'status audit was modified'; end if;
end $$;

do $$
declare tab text;
begin
 foreach tab in array array['btcpay_test_order_status',
   'btcpay_test_order_status_history'] loop
  if has_table_privilege('anon','public.'||tab,'SELECT')
    then raise exception 'anonymous can read %',tab; end if;
  if has_table_privilege('authenticated','public.'||tab,'INSERT') or
     has_table_privilege('authenticated','public.'||tab,'UPDATE') or
     has_table_privilege('authenticated','public.'||tab,'DELETE')
    then raise exception 'browser can mutate %',tab; end if;
 end loop;
 if has_function_privilege('authenticated',
 'apex_test_internal.record_verified_btcpay_event(text,text,text,text,text,text,bigint,text,text,text)','EXECUTE')
 then raise exception 'browser can execute privileged event writer'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
begin
 if (select count(*) from public.btcpay_test_order_status)<>2 or
    (select count(*) from public.btcpay_test_order_status_history)<>6
 then raise exception 'admin order status visibility denied'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$
begin
 if (select count(*) from public.btcpay_test_order_status)<>0 or
    (select count(*) from public.btcpay_test_order_status_history)<>0
 then raise exception 'supplier can see private test order status'; end if;
end $$;
rollback;
