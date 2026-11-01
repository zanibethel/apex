-- Only called by private, previously HMAC-checked and Greenfield-checked
-- ephemeral regtest worker. Atomic SQL function is SECURITY INVOKER.
select apex_test_internal.record_verified_btcpay_event(
 :'store_id',:'invoice_id',:'delivery_id',:'event_type',:'payload_hash',
 :'order_id',:'amount_sats'::bigint,:'provider_status',
 :'additional_status','regtest'
);
