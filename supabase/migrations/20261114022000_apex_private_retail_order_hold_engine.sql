-- Private atomic retail order-hold foundation. NO PUBLIC CHECKOUT OR PAYMENT.
-- Retail items must match the supplier-published content-neutral showcase.
-- Access is intentionally reserved to the migration owner; checkout workers and
-- public clients get no permission. A second independent gate remains OFF.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table apex_internal.retail_order_engine_gate (
 singleton boolean primary key default true check(singleton=true),
 enabled boolean not null default false,
 changed_at timestamptz not null default now()
);
insert into apex_internal.retail_order_engine_gate(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;

create table apex_internal.retail_order_holds (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 request_id uuid not null,
 request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 canonical_items jsonb not null,
 promotion_code text not null default '',
 shipping_box text not null check(shipping_box in ('small','medium')),
 currency text not null default 'USD' check(currency='USD'),
 merchandise_cents bigint not null check(merchandise_cents between 1 and 999999999),
 merchandise_discount_cents bigint not null default 0 check(merchandise_discount_cents>=0),
 shipping_cents bigint not null default 0 check(shipping_cents>=0),
 total_cents bigint not null check(total_cents between 1 and 999999999),
 line_count integer not null check(line_count between 1 and 8),
 unit_count integer not null check(unit_count between 1 and 50),
 state text not null default 'held_no_payment'
  check(state in ('held_no_payment','expired_no_payment','cancelled_no_payment')),
 version integer not null default 1 check(version>=1),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 ended_at timestamptz,
 end_reason text,
 constraint apex_retail_order_expiry_valid check(expires_at>created_at),
 constraint apex_retail_order_terminal_consistent check(
  (state='held_no_payment' and ended_at is null and end_reason is null) or
  (state<>'held_no_payment' and ended_at is not null and end_reason is not null)
 ),
 unique(store_id,request_id),
 unique(id,store_id)
);
create index apex_retail_order_holds_due_idx
 on apex_internal.retail_order_holds(expires_at,id)
 where state='held_no_payment';

create table apex_internal.retail_order_hold_lines (
 order_id uuid not null references apex_internal.retail_order_holds(id),
 product_id uuid not null,
 sku_snapshot text not null,
 name_snapshot text not null,
 quantity integer not null check(quantity between 1 and 10),
 unit_price_cents bigint not null check(unit_price_cents between 1 and 999999999),
 line_subtotal_cents bigint not null check(line_subtotal_cents between 1 and 999999999),
 primary key(order_id,product_id)
);
create table apex_internal.retail_order_hold_events (
 id bigint generated always as identity primary key,
 order_id uuid not null references apex_internal.retail_order_holds(id),
 event_type text not null
  check(event_type in ('hold_created','hold_cancelled','hold_expired')),
 created_at timestamptz not null default now(),
 unique(order_id,event_type)
);
-- Immutable purchase-time (held-intent-time) product/price evidence.
create function apex_internal.reject_retail_hold_line_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $fn$
begin
 raise exception 'Retail hold line snapshots are immutable' using errcode='42501';
end $fn$;
create trigger apex_retail_hold_lines_immutable
 before update or delete on apex_internal.retail_order_hold_lines
 for each row execute function apex_internal.reject_retail_hold_line_mutation();

alter table apex_internal.retail_order_engine_gate enable row level security;
alter table apex_internal.retail_order_engine_gate force row level security;
alter table apex_internal.retail_order_holds enable row level security;
alter table apex_internal.retail_order_holds force row level security;
alter table apex_internal.retail_order_hold_lines enable row level security;
alter table apex_internal.retail_order_hold_lines force row level security;
alter table apex_internal.retail_order_hold_events enable row level security;
alter table apex_internal.retail_order_hold_events force row level security;
revoke all on apex_internal.retail_order_engine_gate,
 apex_internal.retail_order_holds,apex_internal.retail_order_hold_lines,
 apex_internal.retail_order_hold_events
 from public,anon,authenticated,service_role;
revoke all on sequence apex_internal.retail_order_hold_events_id_seq
 from public,anon,authenticated,service_role;

-- This is an INTERNAL PostgreSQL transaction, not a PostgREST RPC.
-- It is restricted to the function owner; no service-role grant is created.
-- p_request_fingerprint must originate with the future trusted server adapter,
-- not a browser. Caller supplies no prices, stock, shipping fees or payment state.
create function apex_internal.reserve_retail_order_hold(
 p_store_id uuid,p_request_id uuid,p_request_fingerprint text,
 p_items jsonb,p_code text,p_box_size text,p_expected_total_cents bigint
) returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_row jsonb;
 v_id uuid;
 v_qty integer;
 v_units integer:=0;
 v_ids uuid[]:='{}'::uuid[];
 v_canonical jsonb;
 v_digest text;
 v_existing apex_internal.retail_order_holds%rowtype;
 v_product public.products%rowtype;
 v_inv public.inventory_items%rowtype;
 v_ctl public.supplier_listing_controls%rowtype;
 v_store public.stores%rowtype;
 v_ship public.apex_store_shipping_settings%rowtype;
 v_promo public.supplier_discount_codes%rowtype;
 v_lines jsonb:='[]'::jsonb;
 v_subtotal bigint:=0;
 v_discount bigint:=0;
 v_discounted bigint;
 v_shipping bigint:=0;
 v_total bigint;
 v_line_amount bigint;
 v_box text;
 v_free_shipping boolean:=false;
 v_order_id uuid;
begin
 if p_store_id is null or p_request_id is null or
  p_request_fingerprint is null or
  p_request_fingerprint !~ '^[0-9a-f]{64}$' or
  p_items is null or jsonb_typeof(p_items)<>'array' or
  jsonb_array_length(p_items) not between 1 and 8 or
  p_code is null or (p_code<>'' and p_code !~ '^[A-Z0-9_-]{3,24}$') or
  p_box_size is null or p_box_size not in ('auto','medium') or
  p_expected_total_cents is null or
  p_expected_total_cents not between 1 and 999999999
 then raise exception 'Invalid retail order hold request' using errcode='22023';end if;

 for v_row in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_row)<>'object' or
   (select count(*) from jsonb_object_keys(v_row))<>2 or
   not (v_row ? 'product_id' and v_row ? 'quantity') or
   jsonb_typeof(v_row->'product_id')<>'string' or
   (v_row->>'product_id') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or
   jsonb_typeof(v_row->'quantity')<>'number' or
   (v_row->>'quantity') !~ '^(?:[1-9]|10)$'
  then raise exception 'Invalid retail order hold line' using errcode='22023';end if;
  v_id:=(v_row->>'product_id')::uuid;
  v_qty:=(v_row->>'quantity')::integer;
  if v_id=any(v_ids) then
   raise exception 'Duplicate retail cart product' using errcode='22023';end if;
  v_ids:=array_append(v_ids,v_id);
  v_units:=v_units+v_qty;
  if v_units>50 then raise exception 'Cart unit limit exceeded' using errcode='22023';end if;
 end loop;
 select jsonb_agg(jsonb_build_object('product_id',(x.value->>'product_id')::uuid,
  'quantity',(x.value->>'quantity')::integer)
  order by (x.value->>'product_id')::uuid)
 into v_canonical from jsonb_array_elements(p_items) x(value);
 v_digest:=encode(sha256(convert_to(jsonb_build_object(
  'items',v_canonical,'promotion_code',p_code,
  'box_size',p_box_size)::text,'UTF8')),'hex');

 -- Identical concurrent request keys serialize before any stock lock.
 perform pg_advisory_xact_lock(hashtextextended(
  p_store_id::text||':'||p_request_id::text,0));
 select * into v_existing from apex_internal.retail_order_holds h
 where h.store_id=p_store_id and h.request_id=p_request_id for update;
 if found then
  if v_existing.request_fingerprint<>p_request_fingerprint or
    v_existing.payload_digest<>v_digest or
    v_existing.canonical_items<>v_canonical or
    v_existing.total_cents<>p_expected_total_cents
  then raise exception 'Idempotency request changed' using errcode='23505';end if;
  return jsonb_build_object('schema_version',1,'order_id',v_existing.id,
   'status',v_existing.state,'replayed',true,
   'total_cents',v_existing.total_cents::text,
   'can_pay',false,'can_ship',false,'invoice_created',false);
 end if;

 -- The production engine gate defaults OFF even if the display gate is ON.
 if not exists(select 1 from apex_internal.retail_order_engine_gate g
   where g.singleton=true and g.enabled=true)
 then raise exception 'Retail order engine remains disabled' using errcode='42501';end if;
 if not exists(select 1 from apex_internal.retail_showcase_gate g
   where g.singleton=true and g.enabled=true)
 then raise exception 'Retail catalog display is disabled' using errcode='42501';end if;

 select * into v_store from public.stores s
 where s.id=p_store_id and s.is_public=false for share;
 if not found then raise exception 'Private supplier store unavailable' using errcode='23514';end if;
 select * into v_ship from public.apex_store_shipping_settings s
 where s.store_id=p_store_id for share;
 if not found or v_ship.envelope_max_items not between 1 and 50 or
  v_ship.flat_shipping_cents not between 0 and 999999999 or
  v_ship.medium_flat_shipping_cents not between 0 and 999999999 or
  (v_ship.free_shipping_min_subtotal_cents is not null and
   v_ship.free_shipping_min_subtotal_cents not between 1 and 999999999) or
  (v_ship.charge_shipping and (v_ship.flat_shipping_cents<1 or
   v_ship.medium_flat_shipping_cents<v_ship.flat_shipping_cents)) or
  (not v_ship.charge_shipping and
   (v_ship.flat_shipping_cents<>0 or v_ship.medium_flat_shipping_cents<>0 or
    v_ship.free_shipping_min_subtotal_cents is not null))
 then raise exception 'Shipping policy unavailable' using errcode='23514';end if;

 -- Stable UUID ordering prevents deadlocks for overlapping multi-line carts.
 for v_row in select value from jsonb_array_elements(v_canonical) x(value)
   order by (x.value->>'product_id')::uuid loop
  v_id:=(v_row->>'product_id')::uuid;
  v_qty:=(v_row->>'quantity')::integer;
  select * into v_product from public.products p
   where p.id=v_id and p.store_id=p_store_id for update;
  if not found or v_product.archived_at is not null or
   v_product.is_published or not v_product.is_active or
   v_product.currency<>'USD' or
   v_product.price_cents not between 1 and 999999999 or
   length(btrim(v_product.name)) not between 1 and 120 or
   length(btrim(coalesce(v_product.description,''))) not between 1 and 1500 or
   length(btrim(v_product.sku))=0 or
   (v_product.category_id is not null and not
    apex_internal.retail_showcase_category_allowed(p_store_id,v_product.category_id))
  then raise exception 'Product unavailable for retail order' using errcode='23514';end if;
  select * into v_ctl from public.supplier_listing_controls ctl
  where ctl.store_id=p_store_id and ctl.product_id=v_id for share;
  if not found or not v_ctl.supplier_wants_listing or
   v_ctl.admin_gate<>'clear' or
   (v_ctl.republish_approval_required and not v_ctl.republish_approved) or
   exists(select 1 from apex_internal.retail_product_visibility_restrictions b
    where b.store_id=p_store_id and b.product_id=v_id and b.is_restricted=true) or
   exists(select 1 from public.private_product_review_states r
    where r.store_id=p_store_id and r.product_id=v_id and
     r.status in ('pending_review','changes_requested')) or
   exists(select 1 from public.supplier_candidate_drafts d
    where d.store_id=p_store_id and d.product_id=v_id) or
   exists(select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=v_store.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(v_product.name))
  then raise exception 'Product publishing or administrator hold' using errcode='23514';end if;
  select * into v_inv from public.inventory_items i
  where i.store_id=p_store_id and i.product_id=v_id for update;
  if not found or v_inv.quantity_on_hand<0 or
   v_inv.quantity_reserved<0 or
   v_inv.quantity_reserved>v_inv.quantity_on_hand or
   v_inv.quantity_on_hand-v_inv.quantity_reserved<v_qty
  then raise exception 'Insufficient verified stock' using errcode='23514';end if;
  v_line_amount:=v_product.price_cents*v_qty;
  if v_subtotal+v_line_amount>999999999
  then raise exception 'Merchandise subtotal exceeded' using errcode='22023';end if;
  v_subtotal:=v_subtotal+v_line_amount;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
   'product_id',v_id,'sku',v_product.sku,'name',v_product.name,
   'quantity',v_qty,'unit_price_cents',v_product.price_cents,
   'line_subtotal_cents',v_line_amount));
 end loop;

 -- Promotions are checked at the locked, saved state (not browser claims).
 if p_code<>'' then
  select * into v_promo from public.supplier_discount_codes c
   where c.store_id=p_store_id and c.code=p_code for share;
  if not found or not v_promo.is_active or
   v_promo.discount_value<=0 or v_promo.min_subtotal_cents>v_subtotal or
   (v_promo.starts_at is not null and v_promo.starts_at>now()) or
   (v_promo.ends_at is not null and v_promo.ends_at<=now()) or
   (v_promo.usage_limit is not null and
    v_promo.redemption_count>=v_promo.usage_limit)
  then raise exception 'Promotion not currently valid' using errcode='23514';end if;
  if v_promo.discount_kind='free_shipping' then
   if v_promo.discount_value<>1 then
    raise exception 'Invalid shipping promotion' using errcode='23514';end if;
   v_free_shipping:=true;
  elsif v_promo.discount_kind='percentage' then
   if v_promo.discount_value>95 then
    raise exception 'Invalid percentage promotion' using errcode='23514';end if;
   v_discount:=least(v_subtotal,
    floor((v_subtotal*v_promo.discount_value+50)::numeric/100)::bigint);
  elsif v_promo.discount_kind='fixed' then
   v_discount:=least(v_subtotal,v_promo.discount_value);
  else raise exception 'Invalid promotion type' using errcode='23514';end if;
 end if;

 v_discounted:=v_subtotal-v_discount;
 v_box:=case when p_box_size='medium' or v_units>v_ship.envelope_max_items
   then 'medium' else 'small' end;
 if v_ship.charge_shipping and not v_free_shipping and
  (v_ship.free_shipping_min_subtotal_cents is null or
   v_discounted<v_ship.free_shipping_min_subtotal_cents)
 then v_shipping:=case when v_box='medium'
  then v_ship.medium_flat_shipping_cents else v_ship.flat_shipping_cents end;
 end if;
 v_total:=v_discounted+v_shipping;
 if v_total not between 1 and 999999999 or
  v_total<>p_expected_total_cents
 then raise exception 'Stale cart total; recheck saved pricing' using errcode='23514';end if;

 insert into apex_internal.retail_order_holds (
  store_id,request_id,request_fingerprint,payload_digest,canonical_items,
  promotion_code,shipping_box,merchandise_cents,
  merchandise_discount_cents,shipping_cents,total_cents,line_count,unit_count
 ) values (
  p_store_id,p_request_id,p_request_fingerprint,v_digest,v_canonical,
  p_code,v_box,v_subtotal,v_discount,v_shipping,v_total,
  jsonb_array_length(v_canonical),v_units
 ) returning id into v_order_id;
 for v_row in select value from jsonb_array_elements(v_lines) x(value) loop
  v_id:=(v_row->>'product_id')::uuid;
  v_qty:=(v_row->>'quantity')::integer;
  insert into apex_internal.retail_order_hold_lines(
   order_id,product_id,sku_snapshot,name_snapshot,quantity,
   unit_price_cents,line_subtotal_cents
  ) values(v_order_id,v_id,v_row->>'sku',v_row->>'name',v_qty,
   (v_row->>'unit_price_cents')::bigint,
   (v_row->>'line_subtotal_cents')::bigint);
  update public.inventory_items set quantity_reserved=quantity_reserved+v_qty
   where store_id=p_store_id and product_id=v_id and
    quantity_on_hand-quantity_reserved>=v_qty;
  if not found then
   raise exception 'Concurrent stock reservation conflict' using errcode='23514';end if;
 end loop;
 insert into apex_internal.retail_order_hold_events(order_id,event_type)
 values(v_order_id,'hold_created');
 return jsonb_build_object('schema_version',1,'order_id',v_order_id,
  'status','held_no_payment','replayed',false,
  'total_cents',v_total::text,'can_pay',false,
  'can_ship',false,'invoice_created',false);
end $fn$;

-- Cancellation and expiry are one-time, idempotent stock releases.
create function apex_internal.end_retail_order_hold(
 p_order_id uuid,p_action text,p_reason text
) returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_order apex_internal.retail_order_holds%rowtype;
 v_line apex_internal.retail_order_hold_lines%rowtype;
 v_state text;
begin
 if p_order_id is null or p_action is null or
  p_action not in ('cancel','expire') or
  p_reason is null or length(btrim(p_reason)) not between 3 and 200
 then raise exception 'Invalid hold termination' using errcode='22023';end if;
 select * into v_order from apex_internal.retail_order_holds
 where id=p_order_id for update;
 if not found then raise exception 'Unknown order hold' using errcode='22023';end if;
 if v_order.state<>'held_no_payment' then
  return jsonb_build_object('order_id',v_order.id,'status',v_order.state,
   'replayed',true,'can_pay',false,'can_ship',false);
 end if;
 if p_action='expire' and v_order.expires_at>now()
 then raise exception 'Order hold has not expired' using errcode='23514';end if;
 for v_line in select * from apex_internal.retail_order_hold_lines
  where order_id=p_order_id order by product_id loop
  update public.inventory_items set quantity_reserved=quantity_reserved-v_line.quantity
   where store_id=v_order.store_id and product_id=v_line.product_id
    and quantity_reserved>=v_line.quantity;
  if not found then raise exception 'Inconsistent stock release' using errcode='23514';end if;
 end loop;
 v_state:=case when p_action='expire' then 'expired_no_payment'
  else 'cancelled_no_payment' end;
 update apex_internal.retail_order_holds
 set state=v_state,ended_at=now(),end_reason=btrim(p_reason),version=version+1
 where id=p_order_id;
 insert into apex_internal.retail_order_hold_events(order_id,event_type)
 values(p_order_id,case when p_action='expire'
  then 'hold_expired' else 'hold_cancelled' end);
 return jsonb_build_object('order_id',p_order_id,'status',v_state,
  'replayed',false,'can_pay',false,'can_ship',false);
end $fn$;

-- Future internal expiry worker; not scheduled or exposed by this migration.
create function apex_internal.expire_due_retail_order_holds(p_limit integer)
 returns integer language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare v_id uuid;v_count integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100
 then raise exception 'Invalid expiry batch size' using errcode='22023';end if;
 for v_id in select id from apex_internal.retail_order_holds
  where state='held_no_payment' and expires_at<=now()
  order by expires_at,id limit p_limit for update skip locked
 loop
  perform apex_internal.end_retail_order_hold(v_id,'expire','Reservation expired');
  v_count:=v_count+1;
 end loop;
 return v_count;
end $fn$;

revoke all on function apex_internal.reject_retail_hold_line_mutation()
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.reserve_retail_order_hold(
 uuid,uuid,text,jsonb,text,text,bigint)
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.end_retail_order_hold(uuid,text,text)
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.expire_due_retail_order_holds(integer)
 from public,anon,authenticated,service_role;

-- Rollout invariant: neither the new gate nor the existing checkout gate is ON.
do $safety$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
     is distinct from false
 then raise exception 'New order engine unexpectedly enabled';end if;
end $safety$;
commit;
