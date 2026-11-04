-- Issue #214 Phase 8: supplier-scoped, read-only HELD order details.
-- Disposable apex_test ONLY: never add to production migrations or enable
-- orders, shipping, label purchases, decrypt, payouts, or invoice creation.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
    or to_regclass('apex_internal.order_detail_snapshots') is null
    or to_regclass('apex_internal.held_order_intake_accounting') is null
    or to_regclass('apex_internal.order_delivery_envelopes') is null
    or to_regclass('apex_internal.held_order_intake_audit') is null
    or (select enabled from apex_internal.private_release_gate where singleton)
       is distinct from false
 then raise exception 'Held order detail RPC is disposable-only and gated';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.get_supplier_held_order_details(
 p_store_id uuid,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_total integer;
 v_items jsonb:='[]'::jsonb;
 v_header apex_internal.order_detail_snapshots%rowtype;
 v_lines jsonb;
 v_count integer;
 v_sum bigint;
 v_accounting apex_internal.held_order_intake_accounting%rowtype;
 v_protected boolean;
 v_complete boolean;
begin
 if current_database()<>'apex_test'
    or v_uid is null or p_store_id is null
    or p_limit is null or p_limit not between 1 and 50
    or p_offset is null or p_offset not between 0 and 1000
    or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
    or not exists (
      select 1 from public.stores s
      join public.supplier_memberships m on m.supplier_id=s.supplier_id
      where s.id=p_store_id and m.user_id=v_uid
    )
 then raise exception 'Supplier order detail access denied'
  using errcode='42501';end if;

 -- Read the global commerce hold, do not infer that "confirmed" source state
 -- is permission to collect payment or fulfill any merchandise.
 if (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Order detail release gate denied'
  using errcode='42501';end if;

 select count(*)::integer into v_total
 from apex_internal.order_detail_snapshots h where h.store_id=p_store_id;

 for v_header in
   select * from apex_internal.order_detail_snapshots h
   where h.store_id=p_store_id
   order by h.original_purchased_at desc,h.id desc
   limit p_limit offset p_offset
 loop
   -- An incomplete or conflicting held snapshot cannot be presented as
   -- verified line-items. The original order reference remains visible,
   -- but no partial item rows or derived totals are returned.
   select count(*)::integer,coalesce(sum(l.line_subtotal_cents),0)::bigint
   into v_count,v_sum
   from apex_internal.order_line_snapshots l
   where l.order_id=v_header.id and l.store_id=p_store_id;

   select * into v_accounting from apex_internal.held_order_intake_accounting a
   where a.order_id=v_header.id and a.store_id=p_store_id;

   select exists (
     select 1 from apex_internal.order_delivery_envelopes d
     where d.order_id=v_header.id and d.store_id=p_store_id
       and d.delivery_verified=false and d.shipping_authorized=false
   ) into v_protected;

   v_complete:=v_count>0 and v_accounting.order_id is not null and v_protected
    and v_header.record_status='held_unverified'
    and v_header.fulfillment_authorized=false
    and v_header.payment_authorized=false
    and v_accounting.expected_line_count=v_count
    and v_accounting.line_subtotal_cents=v_sum
    and v_accounting.source_gross_cents=v_header.source_gross_cents
    and v_accounting.line_subtotal_cents+
      v_accounting.shipping_cents-v_accounting.discount_cents=
       v_header.source_gross_cents
    and exists (
      select 1 from apex_internal.held_order_intake_audit a
      where a.order_id=v_header.id and a.store_id=p_store_id
        and a.event_type='snapshot_held'
        and a.source_sha256=v_header.source_event_sha256
    );

   if v_complete is distinct from true then
     v_items:=v_items||jsonb_build_array(jsonb_build_object(
       'order_id',v_header.id,'order_reference',v_header.source_order_reference,
       'purchased_at_utc',to_char(v_header.original_purchased_at at time zone 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'recorded_sale_state',v_header.source_payment_state,
       'display_status','incomplete_held_record',
       'destination_sealed',false,
       'lines','[]'::jsonb,
       'subtotal_cents',null,'shipping_cents',null,
       'discount_cents',null,'gross_cents',null,
       'can_ship',false,'can_pay',false,'can_decrypt',false
     ));
     continue;
   end if;

   select coalesce(jsonb_agg(jsonb_build_object(
    'line_number',l.line_number,
    'sku',l.sku_at_purchase,
    'title',l.title_at_purchase,
    'variant',l.variant_at_purchase,
    'quantity',l.quantity,
    'unit_price_cents',l.unit_price_cents::text,
    'line_total_cents',l.line_subtotal_cents::text
   ) order by l.line_number),'[]'::jsonb)
   into v_lines
   from apex_internal.order_line_snapshots l
   where l.order_id=v_header.id and l.store_id=p_store_id;

   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'order_id',v_header.id,'order_reference',v_header.source_order_reference,
    'purchased_at_utc',to_char(v_header.original_purchased_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'recorded_sale_state',v_header.source_payment_state,
    'display_status','held_unverified',
    'destination_sealed',true,
    'lines',v_lines,
    'subtotal_cents',v_accounting.line_subtotal_cents::text,
    'shipping_cents',v_accounting.shipping_cents::text,
    'discount_cents',v_accounting.discount_cents::text,
    'gross_cents',v_header.source_gross_cents::text,
    'can_ship',false,'can_pay',false,'can_decrypt',false
   ));
 end loop;
 return jsonb_build_object(
   'schema_version',1,'store_id',p_store_id,
   'source','private_held_order_snapshots',
   'total',v_total,'offset',p_offset,'limit',p_limit,
   'has_more',p_offset+jsonb_array_length(v_items)<v_total,
   'orders',v_items,
   'detail_status','held_unverified',
   'shipping_enabled',false,'payment_enabled',false,
   'delivery_decryption_enabled',false
 );
end $fn$;
revoke all on function public.get_supplier_held_order_details(uuid,integer,integer)
 from public,anon,authenticated;
grant execute on function public.get_supplier_held_order_details(uuid,integer,integer)
 to authenticated;
do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_supplier_held_order_details(uuid,integer,integer)','EXECUTE')
 or not has_function_privilege('authenticated',
   'public.get_supplier_held_order_details(uuid,integer,integer)','EXECUTE')
 or has_table_privilege('authenticated','apex_internal.order_line_snapshots','SELECT')
 or has_table_privilege('authenticated','apex_internal.order_delivery_envelopes','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Supplier detail access postflight denied';end if;
end $postflight$;
commit;
