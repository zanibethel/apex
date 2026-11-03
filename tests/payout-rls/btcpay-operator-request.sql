-- Strict operator requester connection. SQL values bound via validated psql vars.
\set ON_ERROR_STOP on
select apex_test_recovery.request_verified_provider_readback(
 :'intent_id'::uuid,:'invoice_id',:'evidence_sha256');
