-- Check *database* result, not Node's memory-resident journal.
-- The validly signed callback is the only new delivery. Identical replay,
-- tampering and cross-store attempts must not create extra rows or status bumps.
select case when
 (select count(*) from public.btcpay_test_webhook_receipts
  where btcpay_store_id=:'store_id' and invoice_id=:'invoice_id')=1
 and (select count(*) from public.btcpay_test_invoice_observations
  where btcpay_store_id=:'store_id' and invoice_id=:'invoice_id')=1
 and (select count(*) from public.btcpay_test_order_status_history
  where btcpay_store_id=:'store_id' and invoice_id=:'invoice_id')=1
 and (select count(*) from public.btcpay_test_order_status
  where btcpay_store_id=:'store_id' and invoice_id=:'invoice_id'
  and order_reference=:'order_id'
  and expected_amount_sats=:'amount_sats'::bigint
  and status='settled_reported' and status_revision=1)=1
 then 'passed' else 'failed' end;
