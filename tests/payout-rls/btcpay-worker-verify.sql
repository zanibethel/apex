-- PR #172: workers have EXECUTE on one vetted, SECURITY DEFINER
-- readback entry point, not SELECT on payment or approval tables.
\set ON_ERROR_STOP on
select apex_test_internal.worker_verify_btcpay_test_provider_post(
 :'intent_id'::uuid, :'scope_id'::uuid);
