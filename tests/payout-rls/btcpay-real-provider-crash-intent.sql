-- PR #171: Read the durable reservation after the CI worker was killed
-- immediately after BTCPay accepted its real regtest invoice POST.
-- The terminated worker must not have observed or released anything.
\set ON_ERROR_STOP on
select json_build_object(
 'intentId',i.id,
 'storeId',i.btcpay_store_id,
 'orderRef',i.order_reference,
 'amountSats',i.amount_sats::text,
 'network',i.network,
 'observationCount',(select count(*) from public.btcpay_test_provider_post_observations o where o.intent_id=i.id)
)::text
from public.btcpay_test_provider_post_intents i
join public.btcpay_test_checkout_resume_permits p on p.scope_id=i.scope_id
  and p.request_id=i.permit_request_id and p.status='consumed'
join public.btcpay_test_trusted_post_store_bindings b on b.scope_id=i.scope_id
  and b.btcpay_store_id=i.btcpay_store_id and b.network='regtest'
join public.btcpay_test_split_sync_holds h on h.scope_id=i.scope_id and h.status='held'
where i.scope_id='39500000-0000-0000-0000-000000000002'
 and i.order_reference='real-regtest-crash-1' and i.amount_sats=10000
 and i.network='regtest' and not exists (
   select 1 from public.btcpay_test_provider_post_observations o
   where o.intent_id=i.id);
