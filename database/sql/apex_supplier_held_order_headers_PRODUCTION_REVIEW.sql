-- Apex #245: strictly read-only supplier-held order HEADER projection.
-- Does not expose line content, pricing, recipient PII, delivery ciphertext,
-- shipping or payment capabilities. Requires the existing private foundation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.order_line_snapshots') is null
  or to_regclass('apex_internal.order_delivery_envelopes') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Private held header preflight denied'
   using errcode='42501';
 end if;
end $preflight$;

create function public.get_supplier_held_order_headers(
 p_store_id uuid, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_total integer;
 v_rows jsonb;
begin
 if v_uid is null or p_store_id is null or p_limit is null
  or p_limit not between 1 and 25
  or p_offset is null or p_offset not between 0 and 1000
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(
    select 1 from public.stores s
    join public.supplier_memberships m
      on m.supplier_id=s.supplier_id
    where s.id=p_store_id and m.user_id=v_uid
  )
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Supplier held order headers denied'
  using errcode='42501';
 end if;

 -- Fail the whole read closed if original sale identity no longer agrees
 -- with its immutable held snapshot; never infer payment finality from state.
 if exists(
  select 1 from apex_internal.order_detail_snapshots h
  left join public.supplier_sales_history s on s.id=h.sale_id
  where h.store_id=p_store_id
   and (
    s.id is null
    or s.store_id is distinct from h.store_id
    or s.order_reference is distinct from h.source_order_reference
    or s.occurred_at is distinct from h.original_purchased_at
    or s.gross_cents is distinct from h.source_gross_cents
    or s.currency is distinct from h.currency
    or h.record_status is distinct from 'held_unverified'
    or h.payment_authorized is distinct from false
    or h.fulfillment_authorized is distinct from false
   )
 ) then raise exception 'Original held source no longer reconciles'
   using errcode='42501';
 end if;

 select count(*)::integer into v_total
 from apex_internal.order_detail_snapshots
 where store_id=p_store_id;

 with page as (
  select h.id,h.source_order_reference,h.original_purchased_at,
   h.source_payment_state,
   (select count(*)::integer
    from apex_internal.order_line_snapshots l
    where l.store_id=p_store_id and l.order_id=h.id) as stored_line_count,
   exists(select 1 from apex_internal.order_delivery_envelopes d
    where d.store_id=p_store_id and d.order_id=h.id
      and d.shipping_authorized=false
      and d.delivery_verified=false) as destination_sealed
  from apex_internal.order_detail_snapshots h
  where h.store_id=p_store_id
  order by h.original_purchased_at desc,h.id desc
  limit p_limit offset p_offset
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'order_id',id,
  'original_reference',source_order_reference,
  'purchased_at_utc',to_char(original_purchased_at at time zone 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'recorded_sale_state',source_payment_state,
  'stored_line_count',stored_line_count,
  'destination_sealed',destination_sealed,
  'status','held_unverified',
  'can_pay',false,'can_ship',false,'can_decrypt',false
 ) order by original_purchased_at desc,id desc),'[]'::jsonb)
 into v_rows from page;

 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'source','original_held_order_headers',
  'limit',p_limit,'offset',p_offset,'total',v_total,
  'has_more',p_offset+jsonb_array_length(v_rows)<v_total,
  'orders',v_rows,'held_only',true,
  'source_attested',false,'payment_enabled',false,
  'shipping_enabled',false,'delivery_decryption_enabled',false);
end $fn$;

revoke all on function
 public.get_supplier_held_order_headers(uuid,integer,integer)
 from public,anon,authenticated;
grant execute on function
 public.get_supplier_held_order_headers(uuid,integer,integer)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.get_supplier_held_order_headers(uuid,integer,integer)','EXECUTE')
 or not has_function_privilege('authenticated',
  'public.get_supplier_held_order_headers(uuid,integer,integer)','EXECUTE')
 or has_table_privilege('authenticated',
  'apex_internal.order_detail_snapshots','SELECT')
 or has_table_privilege('authenticated',
  'apex_internal.order_line_snapshots','SELECT')
 or has_table_privilege('authenticated',
  'apex_internal.order_delivery_envelopes','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Supplier held header postflight denied';end if;
end $postflight$;
commit;
