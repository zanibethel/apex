-- PR #127. Real loopback BTCPay server was queried and independently
-- verified by the test runner, then cross-checked against disposable DB.
-- The only external invoice is regtest, NEVER a customer checkout.
\set ON_ERROR_STOP on
do $$
declare
 v_intents integer;
 v_obs integer;
begin
 select count(*) into v_intents
 from public.btcpay_test_provider_post_intents i
 where i.scope_id='39500000-0000-0000-0000-000000000001'
 and i.network='regtest' and i.order_reference='real-regtest-worker-1'
 and i.amount_sats=10000;
 if v_intents<>1 then raise exception 'Expected one durably reserved provider intent'; end if;
 select count(*) into v_obs
 from public.btcpay_test_provider_post_observations o
 join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
 where i.scope_id='39500000-0000-0000-0000-000000000001'
 and o.kind='invoice_seen_by_readback'
 and o.provider_invoice_id=:'invoice_id';
 if v_obs<>1 then raise exception 'BTCPay invoice readback not durably recorded'; end if;
 if (select status from public.btcpay_test_checkout_resume_permits
 where scope_id='39500000-0000-0000-0000-000000000001')<>'consumed' then
  raise exception 'Pre-POST authorization was not irrevocably consumed';
 end if;
 if not exists(select 1 from public.btcpay_test_split_sync_holds
 where scope_id='39500000-0000-0000-0000-000000000001' and status='held') then
  raise exception 'Original synchronization hold was removed'; end if;
 if (select status from public.payout_rules
 where id='29500000-0000-0000-0000-000000000001')<>'draft' then
  raise exception 'Split rule unexpectedly activated'; end if;
 if exists(select 1 from public.btcpay_test_invoices
 where apex_store_id='39500000-0000-0000-0000-000000000001') then
  raise exception 'Customer-facing test invoice journal unexpectedly unlocked';
 end if;
 if exists(select 1 from public.btcpay_test_provider_post_observations o
 join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
 where i.scope_id='39500000-0000-0000-0000-000000000001'
 and o.kind='post_outcome_unknown') then
  raise exception 'Confirmed intent is simultaneously marked unknown'; end if;
end $$;
select 'verified';
