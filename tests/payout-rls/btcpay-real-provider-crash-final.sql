-- PR #171: Only after independent authenticated provider readback did
-- a private operator append the provider invoice ID to durable evidence.
-- The crashed POST remains permanently single-use and the checkout held.
\set ON_ERROR_STOP on
select set_config('apex.regtest_crash_invoice_id', :'invoice_id', false) as bound_id \gset
do $$
declare v_scope uuid:='39500000-0000-0000-0000-000000000002';
begin
 if (select count(*) from public.btcpay_test_provider_post_intents
     where scope_id=v_scope and order_reference='real-regtest-crash-1'
      and amount_sats=10000 and network='regtest')<>1 then
   raise exception 'Post-crash reservation was lost or duplicated';
 end if;
 if (select count(*) from public.btcpay_test_provider_post_observations o
    join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
    where i.scope_id=v_scope and o.kind='invoice_seen_by_readback'
      and o.provider_invoice_id=current_setting('apex.regtest_crash_invoice_id'))<>1 then
   raise exception 'Independent provider invoice recovery was not recorded';
 end if;
 if exists(select 1 from public.btcpay_test_provider_post_observations o
    join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
    where i.scope_id=v_scope and o.kind='post_outcome_unknown') then
   raise exception 'Crashing worker persisted a misleading outcome';
 end if;
 if (select status from public.btcpay_test_checkout_resume_permits
    where scope_id=v_scope)<>'consumed' then
   raise exception 'Post-crash permit was reissued or lost';
 end if;
 if not exists(select 1 from public.btcpay_test_split_sync_holds
    where scope_id=v_scope and status='held') then
   raise exception 'Post-crash checkout hold was removed';
 end if;
 if (select status from public.payout_rules where
    id='29500000-0000-0000-0000-000000000002')<>'draft' then
   raise exception 'Post-crash payout rule was activated';
 end if;
 -- Post-crash worker lost its in-memory capability: even though the
 -- capability hash remains, the crashed process did not consume it.
 if not exists(
   select 1 from public.btcpay_test_worker_observation_caps c
   join public.btcpay_test_provider_post_intents i on i.id=c.intent_id
   where i.scope_id=v_scope and c.used_at is null
 ) then
   raise exception 'Crash recovery bypassed the lost-in-memory capability';
 end if;
 if (select count(*) from public.btcpay_test_operator_recovery_requests r
     join public.btcpay_test_operator_recovery_approvals a
      on a.request_id=r.id and a.evidence_sha256=r.evidence_sha256
     join public.btcpay_test_provider_post_intents i
      on i.id=r.intent_id and i.scope_id=r.scope_id
    where r.scope_id=v_scope and
      r.provider_invoice_id=current_setting('apex.regtest_crash_invoice_id')
      and r.requested_by='apex_test_recovery_requester'
      and a.approved_by='apex_test_recovery_reviewer')<>1 then
   raise exception 'Independent recovery identities or evidence disagree';
 end if;
 if exists(select 1 from public.btcpay_test_invoices where apex_store_id=v_scope) then
   raise exception 'Post-crash customer invoice journal unexpectedly unlocked';
 end if;
end $$;
select 'verified';
