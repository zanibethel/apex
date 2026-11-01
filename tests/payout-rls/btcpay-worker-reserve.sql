-- Isolated worker-only SQL: durable transaction COMMITTED by psql before HTTP.
\set ON_ERROR_STOP on
select apex_test_internal.reserve_btcpay_test_provider_post(
 :'scope_id'::uuid,:'store_id',:'order_ref',:'amount_sats'::bigint);
