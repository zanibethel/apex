-- Different, separately logged-in reviewer must confirm evidence digest.
\set ON_ERROR_STOP on
select apex_test_recovery.approve_verified_provider_readback(
 :'request_id'::uuid,:'evidence_sha256');
