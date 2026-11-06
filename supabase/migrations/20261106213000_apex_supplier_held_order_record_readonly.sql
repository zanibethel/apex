-- A supplier-scoped, single HELD-order metadata lookup.
-- This is not a shipping, payment, purchased-item or delivery API.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.order_line_snapshots') is null
  or to_regclass('apex_internal.order_delivery_envelopes') is null
  or to_regclass('public.supplier_sales_history') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
      is distinct from false
  or has_schema_privilege('authenticated','apex_internal','USAGE')
  or has_schema_privilege('anon','apex_internal','USAGE')
 then raise exception 'Private held-order record preflight denied'; end if;
end $preflight$;

create function public.get_supplier_held_order_record(
 p_store_id uuid,p_order_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog
as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_record record;
 v_line_count integer;
 v_destination_count integer;
begin
 if v_uid is null or p_store_id is null or p_order_id is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists (
    select 1 from public.stores s
    join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=p_store_id and m.user_id=v_uid
  )
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Supplier held order lookup denied' using errcode='42501';
 end if;

 select h.*,s.id as source_sale_id,s.store_id as source_store_id,
   s.order_reference as sale_reference,s.occurred_at as sale_purchased_at,
   s.gross_cents as sale_gross_cents,s.currency as sale_currency,
   s.sale_state as sale_state
 into v_record
 from apex_internal.order_detail_snapshots h
 left join public.supplier_sales_history s on s.id=h.sale_id
 where h.store_id=p_store_id and h.id=p_order_id;
 if not found then return null; end if;

 -- Matching original sale history is not independent payment settlement.
 if v_record.source_sale_id is null
  or v_record.source_store_id is distinct from p_store_id
  or v_record.sale_reference is distinct from v_record.source_order_reference
  or v_record.sale_purchased_at is distinct from v_record.original_purchased_at
  or v_record.sale_gross_cents is distinct from v_record.source_gross_cents
  or v_record.sale_currency is distinct from v_record.currency
  or v_record.sale_state is distinct from v_record.source_payment_state
  or v_record.record_status is distinct from 'held_unverified'
  or v_record.payment_authorized is distinct from false
  or v_record.fulfillment_authorized is distinct from false
  or exists (
    select 1 from apex_internal.order_line_snapshots l
    where l.order_id=p_order_id and l.store_id=p_store_id
      and (l.shipping_authorized is distinct from false
        or l.product_eligibility is distinct from 'not_verified')
  )
  or exists (
    select 1 from apex_internal.order_delivery_envelopes d
    where d.order_id=p_order_id and d.store_id=p_store_id
      and (d.shipping_authorized is distinct from false
       or d.delivery_verified is distinct from false)
  )
 then raise exception 'Held source cannot be independently reconciled'
  using errcode='42501';
 end if;

 select count(*)::integer into v_line_count
 from apex_internal.order_line_snapshots l
 where l.order_id=p_order_id and l.store_id=p_store_id;
 select count(*)::integer into v_destination_count
 from apex_internal.order_delivery_envelopes d
 where d.order_id=p_order_id and d.store_id=p_store_id;

 if v_line_count>50 or v_destination_count>1
 then raise exception 'Held record exceeds safe bounds' using errcode='42501';
 end if;

 return jsonb_build_object(
  'schema_version',1,
  'source','original_held_order_record',
  'store_id',p_store_id,
  'order_id',p_order_id,
  'original_reference',v_record.source_order_reference,
  'purchased_at_utc',to_char(
    v_record.original_purchased_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'recorded_sale_state',v_record.source_payment_state,
  'stored_line_count',v_line_count,
  'destination_sealed',v_destination_count=1,
  'source_history_matched',true,
  'held_only',true,
  'payment_enabled',false,
  'shipping_enabled',false,
  'delivery_decryption_enabled',false
 );
end $fn$;

revoke all on function public.get_supplier_held_order_record(uuid,uuid)
 from PUBLIC,anon,authenticated;
grant execute on function public.get_supplier_held_order_record(uuid,uuid)
 to authenticated;

comment on function public.get_supplier_held_order_record(uuid,uuid)
 is 'Membership-scoped read-only original held-order metadata by immutable ID. Does not expose purchase items, addresses, payment evidence or fulfillment rights.';

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_supplier_held_order_record(uuid,uuid)','EXECUTE')
  or not has_function_privilege('authenticated',
   'public.get_supplier_held_order_record(uuid,uuid)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots','SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.order_delivery_envelopes','SELECT')
  or has_table_privilege('anon','apex_internal.order_detail_snapshots','SELECT')
 then raise exception 'Held-order record access postflight denied';end if;
end $postflight$;
commit;