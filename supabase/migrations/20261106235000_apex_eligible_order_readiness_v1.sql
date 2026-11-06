-- PR #303 / Issue #215: supplier-only, read-only eligibility handoff.
-- No independent settlement, supplier/product/transport authorization or
-- validated delivery source exists yet. Consequently this returns NO eligible
-- orders, regardless of recorded sale state or stored shipment review plans.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.order_line_snapshots') is null
  or to_regclass('apex_internal.order_delivery_envelopes') is null
  or to_regclass('public.supplier_sales_history') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or has_schema_privilege('authenticated', 'apex_internal', 'USAGE')
  or has_schema_privilege('anon', 'apex_internal', 'USAGE')
 then raise exception 'Eligible order readiness preflight denied' using errcode = '42501';
 end if;
end $preflight$;

create function public.get_supplier_eligible_order_readiness_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog
as $fn$
declare
 v_uid uuid := (select auth.uid());
 v_held integer;
begin
 if v_uid is null or p_store_id is null
  or coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'true'
  or not exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id = s.supplier_id
   where s.id = p_store_id and m.user_id = v_uid
  )
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Supplier eligibility readiness denied' using errcode = '42501';
 end if;

 -- A historical confirmed sale is NOT proof of final settlement.
 -- If source identity was rewritten, fail the entire projection closed.
 if exists (
  select 1
  from apex_internal.order_detail_snapshots h
  left join public.supplier_sales_history s on s.id = h.sale_id
  where h.store_id = p_store_id and (
   s.id is null or s.store_id is distinct from h.store_id
   or s.order_reference is distinct from h.source_order_reference
   or s.occurred_at is distinct from h.original_purchased_at
   or s.gross_cents is distinct from h.source_gross_cents
   or s.currency is distinct from h.currency
   or h.record_status is distinct from 'held_unverified'
   or h.payment_authorized is distinct from false
   or h.fulfillment_authorized is distinct from false
  )
 ) then raise exception 'Original held order source conflict' using errcode = '42501';
 end if;

 select count(*)::integer into v_held
 from apex_internal.order_detail_snapshots h
 where h.store_id = p_store_id;

 -- This v1 contract deliberately has no independent attestation source.
 -- Never derive an eligible order from a client flag, sale_state=confirmed,
 -- a private shipment review plan, USPS setup, or a sealed destination.
 return jsonb_build_object(
  'schema_version', 1,
  'source', 'held_order_readiness_no_independent_attestation',
  'store_id', p_store_id,
  'held_order_count', v_held,
  'eligible_order_count', 0,
  'eligible_orders', '[]'::jsonb,
  'blocker', 'independent_eligibility_evidence_not_integrated',
  'read_only', true,
  'eligible_queue_enabled', false,
  'payment_verified', false,
  'product_and_transport_verified', false,
  'delivery_access_enabled', false,
  'shipping_enabled', false,
  'can_purchase_label', false,
  'can_record_tracking', false
 );
end $fn$;

comment on function public.get_supplier_eligible_order_readiness_v1(uuid) is
 'Fail-closed supplier readiness v1: counts original held records without granting eligibility, settlement, PII access, tracking, postage or shipment transitions.';
revoke all on function public.get_supplier_eligible_order_readiness_v1(uuid)
 from public, anon, authenticated;
grant execute on function public.get_supplier_eligible_order_readiness_v1(uuid)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_supplier_eligible_order_readiness_v1(uuid)', 'EXECUTE')
  or not has_function_privilege('authenticated',
   'public.get_supplier_eligible_order_readiness_v1(uuid)', 'EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_detail_snapshots', 'SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots', 'SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.order_delivery_envelopes', 'SELECT')
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Eligible order readiness postflight denied' using errcode = '42501';
 end if;
end $postflight$;
commit;
