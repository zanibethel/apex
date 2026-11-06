-- Apex: supplier-only original held-order line read for private review.
-- Does NOT create shipment eligibility, stock reservation or payment rights.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.order_line_snapshots') is null
  or to_regclass('public.supplier_sales_history') is null
  or to_regprocedure('public.get_supplier_held_order_record(uuid,uuid)') is null
  or (select enabled from apex_internal.private_release_gate where singleton=true)
       is distinct from false
  or has_schema_privilege('authenticated','apex_internal','USAGE')
  or has_schema_privilege('anon','apex_internal','USAGE')
 then raise exception 'Private held-order line review preflight denied';
 end if;
end $preflight$;

create function public.get_supplier_held_order_lines(
 p_store_id uuid,p_order_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog
as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_order record;
 v_lines jsonb;
 v_count integer;
begin
 if v_uid is null or p_store_id is null or p_order_id is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
  )
  or (select enabled from apex_internal.private_release_gate where singleton=true)
       is distinct from false
 then raise exception 'Supplier held-order line review denied'
  using errcode='42501';
 end if;

 select h.id,h.store_id,h.record_status,h.payment_authorized,
  h.fulfillment_authorized,h.source_order_reference,
  h.original_purchased_at,h.source_payment_state,
  h.source_gross_cents,h.currency,
  s.id as recorded_sale_id,s.store_id as recorded_store_id,
  s.order_reference as recorded_reference,
  s.occurred_at as recorded_date,s.sale_state as recorded_state,
  s.gross_cents as recorded_gross,s.currency as recorded_currency
 into v_order
 from apex_internal.order_detail_snapshots h
 left join public.supplier_sales_history s on s.id=h.sale_id
 where h.id=p_order_id and h.store_id=p_store_id;
 if not found then return null; end if;

 -- These are immutable held snapshots, not independently settled purchases.
 if v_order.recorded_sale_id is null
  or v_order.recorded_store_id is distinct from p_store_id
  or v_order.recorded_reference is distinct from v_order.source_order_reference
  or v_order.recorded_date is distinct from v_order.original_purchased_at
  or v_order.recorded_state is distinct from v_order.source_payment_state
  or v_order.recorded_gross is distinct from v_order.source_gross_cents
  or v_order.recorded_currency is distinct from v_order.currency
  or v_order.record_status is distinct from 'held_unverified'
  or v_order.payment_authorized is distinct from false
  or v_order.fulfillment_authorized is distinct from false
  or exists (
   select 1 from apex_internal.order_line_snapshots l
   where l.store_id=p_store_id and l.order_id=p_order_id
    and (l.product_eligibility is distinct from 'not_verified'
      or l.shipping_authorized is distinct from false)
  )
  or exists (
   select 1 from apex_internal.order_delivery_envelopes d
   where d.store_id=p_store_id and d.order_id=p_order_id
    and (d.delivery_verified is distinct from false
      or d.shipping_authorized is distinct from false)
  )
 then raise exception 'Original held line source cannot be reconciled'
  using errcode='42501';
 end if;

 select count(*)::integer into v_count
 from apex_internal.order_line_snapshots l
 where l.store_id=p_store_id and l.order_id=p_order_id;
 if v_count>50 then raise exception 'Too many held order lines'
  using errcode='42501';end if;

 -- Purchase snapshots, never mutable current product details. Do not return
 -- private source hashes, buyer contact, recipient address or ciphertext.
 select coalesce(jsonb_agg(jsonb_build_object(
  'line_id',l.id,
  'line_number',l.line_number,
  'sku_at_purchase',l.sku_at_purchase,
  'title_at_purchase',l.title_at_purchase,
  'variant_at_purchase',l.variant_at_purchase,
  'quantity',l.quantity,
  'unit_price_cents',l.unit_price_cents::text,
  'line_subtotal_cents',l.line_subtotal_cents::text,
  'currency',l.currency,
  'status','held_unverified',
  'shipping_authorized',false
 ) order by l.line_number,l.id),'[]'::jsonb)
 into v_lines
 from apex_internal.order_line_snapshots l
 where l.store_id=p_store_id and l.order_id=p_order_id;

 return jsonb_build_object(
  'schema_version',1,
  'source','original_held_order_line_snapshots',
  'store_id',p_store_id,
  'order_id',p_order_id,
  'line_count',v_count,
  'lines',v_lines,
  'held_only',true,
  'product_eligibility_verified',false,
  'payment_verified',false,
  'shipping_enabled',false,
  'delivery_decryption_enabled',false
 );
end $fn$;

revoke all on function public.get_supplier_held_order_lines(uuid,uuid)
 from PUBLIC,anon,authenticated;
grant execute on function public.get_supplier_held_order_lines(uuid,uuid)
 to authenticated;

comment on function public.get_supplier_held_order_lines(uuid,uuid) is
 'Signed-in supplier-only original line snapshot review. Line identities/quantities from immutable held snapshots, no fulfillment authorization or customer data.';

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_supplier_held_order_lines(uuid,uuid)','EXECUTE')
  or not has_function_privilege('authenticated',
   'public.get_supplier_held_order_lines(uuid,uuid)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots','SELECT')
  or has_table_privilege('anon',
   'apex_internal.order_detail_snapshots','SELECT')
  or (select enabled from apex_internal.private_release_gate where singleton=true)
      is distinct from false
 then raise exception 'Order-line review permissions postflight denied';end if;
end $postflight$;
commit;