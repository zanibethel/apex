-- Append-only observation; any failure is an operator-reconciliation event.
\set ON_ERROR_STOP on
select apex_test_worker.worker_observe_with_observation_cap(
 :'intent_id'::uuid,:'kind',nullif(:'invoice_id',''),:'observation_token');
