-- Apex Issue #215 Phase 2: supplier-scoped read-only review fulfillment queue.
-- Disposable apex_test ONLY. No production migration, shipping, carrier calls,
-- label purchasing, order authorization, address reads, or supplier mutations.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regclass('apex_internal.review_shipment_plans') is null
 or to_regclass('apex_internal.review_shipment_allocations') is null
 or to_regclass('apex_internal.review_shipment_events') is null
 or to_regclass('apex_internal.order_detail_snapshots') is null
 or to_regclass('apex_internal.held_order_intake_accounting') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review fulfillment queue requires gated disposable database';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.get_supplier_review_fulfillment_queue(
 p_store_id uuid,p_limit integer default 10,p_offset integer default 0)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_total integer;
 v_orders jsonb:='[]'::jsonb;
 v_header apex_internal.order_detail_snapshots%rowtype;
 v_account apex_internal.held_order_intake_accounting%rowtype;
 v_count integer;
 v_sum bigint;
 v_sealed boolean;
 v_valid boolean;
 v_lines jsonb;
 v_plans jsonb;
 v_purchased integer;
 v_planned integer;
begin
 if current_database()<>'apex_test'
 or p_store_id is null or v_uid is null
 or p_limit is null or p_limit not between 1 and 20
 or p_offset is null or p_offset not between 0 and 1000
 or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
 or not exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
 )
 then raise exception 'Supplier review queue membership required'
  using errcode='42501';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review queue release gate denied'
  using errcode='42501';end if;

 select count(*)::integer into v_total
 from apex_internal.order_detail_snapshots
 where store_id=p_store_id;
 for v_header in
  select * from apex_internal.order_detail_snapshots h
  where h.store_id=p_store_id
  order by h.original_purchased_at desc,h.id desc
  limit p_limit offset p_offset
 loop
  -- A complete historical held snapshot is necessary even for a
  -- planning-only display. Never synthesize items from a sale header.
  select * into v_account from apex_internal.held_order_intake_accounting a
  where a.store_id=p_store_id and a.order_id=v_header.id;
  select count(*)::integer,coalesce(sum(line_subtotal_cents),0)::bigint
   into v_count,v_sum from apex_internal.order_line_snapshots l
   where l.store_id=p_store_id and l.order_id=v_header.id;
  select exists(
   select 1 from apex_internal.order_delivery_envelopes d
   where d.store_id=p_store_id and d.order_id=v_header.id
    and d.delivery_verified=false and d.shipping_authorized=false
  ) into v_sealed;

  v_valid:=v_account.order_id is not null and v_count>0 and v_sealed
   and v_header.record_status='held_unverified'
   and v_header.payment_authorized=false
   and v_header.fulfillment_authorized=false
   and v_account.expected_line_count=v_count
   and v_account.line_subtotal_cents=v_sum
   and v_account.source_gross_cents=v_header.source_gross_cents
   and v_account.line_subtotal_cents+v_account.shipping_cents-
    v_account.discount_cents=v_header.source_gross_cents
   and exists(
     select 1 from apex_internal.held_order_intake_audit a
     where a.store_id=p_store_id and a.order_id=v_header.id
       and a.event_type='snapshot_held'
       and a.source_sha256=v_header.source_event_sha256
   )
   -- Defend the read boundary from accidental privileged malformed inserts.
   and not exists(
     select 1 from apex_internal.review_shipment_plans s
     where s.store_id=p_store_id and s.order_id=v_header.id
       and (s.plan_status<>'review_only'
         or s.fulfillment_authorized<>false
         or s.label_purchase_authorized<>false)
   )
   and not exists(
     select 1 from apex_internal.review_shipment_allocations a
     left join apex_internal.order_line_snapshots l on l.id=a.order_line_id
     where a.store_id=p_store_id and a.order_id=v_header.id
       and (l.id is null or l.store_id<>p_store_id or l.order_id<>v_header.id)
   )
   and not exists(
     select 1 from apex_internal.order_line_snapshots l
     where l.store_id=p_store_id and l.order_id=v_header.id
     and coalesce((
       select sum(a.planned_quantity) from apex_internal.review_shipment_allocations a
       where a.store_id=p_store_id and a.order_id=v_header.id
        and a.order_line_id=l.id
     ),0)>l.quantity
   );

  if v_valid is distinct from true then
   v_orders:=v_orders||jsonb_build_array(jsonb_build_object(
    'order_id',v_header.id,
    'order_reference',v_header.source_order_reference,
    'purchased_at_utc',to_char(v_header.original_purchased_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'readiness','incomplete_held_record',
    'lines','[]'::jsonb,'plans','[]'::jsonb,
    'purchased_units',null,'planned_units',null,'unplanned_units',null,
    'can_ship',false,'can_buy_label',false,'can_enter_tracking',false
   ));
   continue;
  end if;

  -- Immutable quantities minus DRAFT planned allocations are UNPLANNED,
  -- not "unshipped", "on-hand", "packed", or "fulfilled" stock.
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_number',q.line_number,'sku',q.sku_at_purchase,
    'title',q.title_at_purchase,'variant',q.variant_at_purchase,
    'purchased_quantity',q.quantity,'planned_quantity',q.planned_quantity,
    'unplanned_quantity',q.quantity-q.planned_quantity
   ) order by q.line_number),'[]'::jsonb),
   coalesce(sum(q.quantity),0)::integer,
   coalesce(sum(q.planned_quantity),0)::integer
  into v_lines,v_purchased,v_planned
  from (
   select l.line_number,l.sku_at_purchase,l.title_at_purchase,
     l.variant_at_purchase,l.quantity,
     coalesce((
       select sum(a.planned_quantity)::integer
       from apex_internal.review_shipment_allocations a
       where a.store_id=p_store_id and a.order_id=v_header.id
        and a.order_line_id=l.id
     ),0) as planned_quantity
   from apex_internal.order_line_snapshots l
   where l.store_id=p_store_id and l.order_id=v_header.id
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
   'shipment_id',s.id,'reference',s.client_shipment_reference,
   'revision',s.revision,'status','review_only',
   'planned_units',coalesce((
     select sum(a.planned_quantity)::integer
     from apex_internal.review_shipment_allocations a
     where a.shipment_id=s.id and a.store_id=p_store_id
      and a.order_id=v_header.id
   ),0),
   'tracking_drafts',coalesce((
     select jsonb_agg(jsonb_build_object(
       'carrier',e.carrier,'tracking_reference',e.tracking_reference,
       'revision',e.revision,
       'recorded_at_utc',to_char(e.occurred_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     ) order by e.revision)
     from apex_internal.review_shipment_events e
     where e.store_id=p_store_id and e.order_id=v_header.id
      and e.shipment_id=s.id and e.event_kind='tracking_draft_recorded'
   ),'[]'::jsonb),
   'can_ship',false,'can_buy_label',false
  ) order by s.created_at,s.id),'[]'::jsonb)
  into v_plans from apex_internal.review_shipment_plans s
  where s.store_id=p_store_id and s.order_id=v_header.id;

  v_orders:=v_orders||jsonb_build_array(jsonb_build_object(
   'order_id',v_header.id,
   'order_reference',v_header.source_order_reference,
   'purchased_at_utc',to_char(v_header.original_purchased_at at time zone 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'readiness','held_review_only',
   'lines',v_lines,'plans',v_plans,
   'purchased_units',v_purchased,
   'planned_units',v_planned,
   'unplanned_units',v_purchased-v_planned,
   'can_ship',false,'can_buy_label',false,'can_enter_tracking',false
  ));
 end loop;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,'source','synthetic_held_review',
  'total',v_total,'limit',p_limit,'offset',p_offset,
  'has_more',p_offset+jsonb_array_length(v_orders)<v_total,
  'orders',v_orders,
  'shipping_enabled',false,'label_purchase_enabled',false,
  'tracking_entry_enabled',false,'delivery_decryption_enabled',false
 );
end $fn$;
revoke all on function public.get_supplier_review_fulfillment_queue(
 uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_supplier_review_fulfillment_queue(
 uuid,integer,integer) to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.get_supplier_review_fulfillment_queue(uuid,integer,integer)','EXECUTE')
 or not has_function_privilege('authenticated',
  'public.get_supplier_review_fulfillment_queue(uuid,integer,integer)','EXECUTE')
 or has_table_privilege('authenticated',
  'apex_internal.review_shipment_plans','SELECT')
 or has_table_privilege('authenticated',
  'apex_internal.review_shipment_events','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Review queue security postflight denied';end if;
end $postflight$;
commit;
