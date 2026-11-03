-- Read back the persisted intent, consumed permit, audited snapshot, and
-- immutable Apex-to-Greenfield store binding before *any* external POST.
\set ON_ERROR_STOP on
select json_build_object(
 'intentId',i.id,'storeId',i.btcpay_store_id,
 'orderRef',i.order_reference,'amountSats',i.amount_sats::text,
 'network',i.network,'status','reserved_before_post')::text
from public.btcpay_test_provider_post_intents i
join public.btcpay_test_checkout_resume_permits p
  on p.scope_id=i.scope_id and p.request_id=i.permit_request_id
 and p.audit_head_id=i.audit_head_id and p.status='consumed'
join public.btcpay_test_trusted_post_store_bindings b
 on b.scope_id=i.scope_id and b.btcpay_store_id=i.btcpay_store_id
  and b.network='regtest'
join public.btcpay_test_release_approvals a
  on a.scope_id=i.scope_id and a.audit_head_id=i.audit_head_id
where i.id=:'intent_id'::uuid and i.scope_id=:'scope_id'::uuid
 and i.network='regtest'
 and i.audit_head_id=(select max(e.id)
    from public.btcpay_test_sync_recovery_events e
    where e.scope_id=i.scope_id)
 and apex_test_internal.test_release_evidence_current(
    i.scope_id,a.rule_id,a.rule_version,a.allocation_snapshot,a.audit_head_id);
