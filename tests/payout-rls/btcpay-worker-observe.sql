-- Append-only observation; any failure is an operator-reconciliation event.
\set ON_ERROR_STOP on
select apex_test_internal.observe_btcpay_test_provider_post(
 :'intent_id'::uuid,:'kind',nullif(:'invoice_id',''));
