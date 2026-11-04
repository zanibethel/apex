-- PR #206: store-scoped automatic envelope capacity (default 4 units).
-- Read-only quote expansion; no customer sale, order, payment or public release.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.apex_store_shipping_settings') is null
 or to_regclass('public.apex_shipping_setting_events') is null
 or to_regprocedure('public.save_private_store_usps_shipping_settings(uuid,boolean,bigint,bigint,bigint)') is null
 or to_regprocedure('public.get_public_cart_quote_source(jsonb,text)') is null
 or to_regprocedure('public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)') is null
 or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Envelope capacity preflight denied';end if;
end $preflight$;

alter table public.apex_store_shipping_settings
 add column envelope_max_items integer not null default 4
 constraint envelope_max_items_range check (envelope_max_items between 1 and 50);

create function public.save_private_store_usps_shipping_capacity(
 p_store_id uuid,p_charge_shipping boolean,
 p_small_flat_rate_cents bigint,p_medium_flat_rate_cents bigint,
 p_free_shipping_min_subtotal_cents bigint,p_envelope_max_items integer
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_old public.apex_store_shipping_settings%rowtype;
 v_exists boolean;
 v_old_json jsonb;
 v_new_json jsonb;
begin
 if not public.apex_can_edit_private_checkout_rules(p_store_id)
 then raise exception 'Private store editor required' using errcode='42501';end if;
 if p_envelope_max_items is null or p_envelope_max_items not between 1 and 50
  or p_charge_shipping is null or p_small_flat_rate_cents is null
  or p_medium_flat_rate_cents is null
  or p_small_flat_rate_cents not between 0 and 999999999
  or p_medium_flat_rate_cents not between 0 and 999999999
  or (p_charge_shipping and
    (p_small_flat_rate_cents<1 or p_medium_flat_rate_cents<p_small_flat_rate_cents
     or p_free_shipping_min_subtotal_cents is null
     or p_free_shipping_min_subtotal_cents not between 1 and 999999999))
  or (not p_charge_shipping and
    (p_small_flat_rate_cents<>0 or p_medium_flat_rate_cents<>0
     or p_free_shipping_min_subtotal_cents is not null))
 then raise exception 'Invalid USPS shipping configuration' using errcode='22023';end if;
 perform 1 from public.stores s where s.id=p_store_id and not s.is_public
  for update;
 if not found then raise exception 'Store no longer private' using errcode='42501';end if;
 select * into v_old from public.apex_store_shipping_settings s
  where s.store_id=p_store_id for update;
 v_exists:=found;
 v_old_json:=jsonb_build_object(
  'charge_shipping',coalesce(v_old.charge_shipping,false),
  'flat_shipping_cents',coalesce(v_old.flat_shipping_cents,0),
  'medium_flat_shipping_cents',coalesce(v_old.medium_flat_shipping_cents,0),
  'free_shipping_min_subtotal_cents',v_old.free_shipping_min_subtotal_cents,
  'envelope_max_items',coalesce(v_old.envelope_max_items,4));
 v_new_json:=jsonb_build_object(
  'charge_shipping',p_charge_shipping,
  'flat_shipping_cents',p_small_flat_rate_cents,
  'medium_flat_shipping_cents',p_medium_flat_rate_cents,
  'free_shipping_min_subtotal_cents',p_free_shipping_min_subtotal_cents,
  'envelope_max_items',p_envelope_max_items);
 if not v_exists or v_old_json<>v_new_json then
  insert into public.apex_store_shipping_settings(
   store_id,charge_shipping,flat_shipping_cents,medium_flat_shipping_cents,
   free_shipping_min_subtotal_cents,envelope_max_items,updated_by
  ) values(p_store_id,p_charge_shipping,p_small_flat_rate_cents,p_medium_flat_rate_cents,
   p_free_shipping_min_subtotal_cents,p_envelope_max_items,v_actor)
  on conflict(store_id) do update set
   charge_shipping=excluded.charge_shipping,
   flat_shipping_cents=excluded.flat_shipping_cents,
   medium_flat_shipping_cents=excluded.medium_flat_shipping_cents,
   free_shipping_min_subtotal_cents=excluded.free_shipping_min_subtotal_cents,
   envelope_max_items=excluded.envelope_max_items,
   updated_by=excluded.updated_by,updated_at=now();
  insert into public.apex_shipping_setting_events(
   store_id,changed_by,old_settings,new_settings
  ) values(p_store_id,v_actor,v_old_json,v_new_json);
 end if;
 return v_new_json||jsonb_build_object('status','saved','checkout_enabled',false);
end $fn$;

revoke all on function public.save_private_store_usps_shipping_capacity(
 uuid,boolean,bigint,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.save_private_store_usps_shipping_capacity(
 uuid,boolean,bigint,bigint,bigint,integer) to authenticated;
revoke execute on function public.save_private_store_usps_shipping_settings(
 uuid,boolean,bigint,bigint,bigint) from public,anon,authenticated;

create or replace function public.get_admin_private_checkout_charge_source(
 p_store_id uuid,p_product_id uuid,p_quantity integer,p_code text
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_product public.products%rowtype;
 v_shipping public.apex_store_shipping_settings%rowtype;
 v_promotion public.supplier_discount_codes%rowtype;
 v_promo_exists boolean:=false;
 v_code text;
 v_quantity_available integer;
 v_subtotal bigint;
begin
 if v_actor is null or (select auth.jwt())
    #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 if p_store_id is null or p_product_id is null or p_quantity is null
  or p_quantity not between 1 and 10 or p_code is null
  or length(p_code)>24
 then raise exception 'Invalid private checkout estimate request'
  using errcode='22023';end if;
 v_code:=btrim(p_code);
 if v_code<>'' and v_code !~ '^[A-Z0-9_-]{3,24}$'
 then raise exception 'Invalid promotion code' using errcode='22023';end if;
 if not exists(select 1 from public.stores s
  where s.id=p_store_id and s.is_public=false)
  or (select enabled from apex_internal.private_release_gate
     where singleton) is distinct from false
 then raise exception 'Private release gate required'
  using errcode='42501';end if;

 select * into v_product from public.products p
  where p.id=p_product_id and p.store_id=p_store_id
    and not p.is_published and p.currency='USD'
    and p.price_cents between 1 and 999999999;
 if not found then raise exception 'Private product unavailable'
  using errcode='42501';end if;
 v_subtotal:=v_product.price_cents*p_quantity;
 if v_subtotal>999999999 then
  raise exception 'Total exceeds limit' using errcode='22023';end if;
 select greatest(0,i.quantity_on_hand-i.quantity_reserved)
  into v_quantity_available from public.inventory_items i
  where i.store_id=p_store_id and i.product_id=p_product_id;
 select * into v_shipping from public.apex_store_shipping_settings s
  where s.store_id=p_store_id;
 if v_code<>'' then
  select * into v_promotion from public.supplier_discount_codes d
   where d.store_id=p_store_id and d.code=v_code;
  v_promo_exists:=found;
 end if;

 return jsonb_build_object(
  'schema_version',2,'state','private_shipping_charge_source',
  'store_id',p_store_id,'product_id',v_product.id,
  'name',v_product.name,'currency','USD',
  'quantity',p_quantity,'unit_price_cents',v_product.price_cents,
  'observed_subtotal_cents',v_subtotal,
  'quantity_available',v_quantity_available,
  'shipping',jsonb_build_object(
   'charge_shipping',coalesce(v_shipping.charge_shipping,false),
   'flat_shipping_cents',coalesce(v_shipping.flat_shipping_cents,0),
   'medium_flat_shipping_cents',coalesce(v_shipping.medium_flat_shipping_cents,0),
   'free_shipping_min_subtotal_cents',v_shipping.free_shipping_min_subtotal_cents,
   'envelope_max_items',coalesce(v_shipping.envelope_max_items,4)),
  'requested_code',v_code,'promotion_found',v_promo_exists,
  'promotion',case when v_promo_exists then jsonb_build_object(
    'code',v_promotion.code,'is_active',v_promotion.is_active,
    'discount_kind',v_promotion.discount_kind,
    'discount_value',v_promotion.discount_value,
    'min_subtotal_cents',v_promotion.min_subtotal_cents,
    'starts_at',v_promotion.starts_at,'ends_at',v_promotion.ends_at,
    'usage_limit',v_promotion.usage_limit,
    'redemption_count',v_promotion.redemption_count)
   else null end,
  'can_create_order',false,'can_create_invoice',false,
  'can_reserve_stock',false,'can_pay',false,
  'checkout_enabled',false);
end $fn$;



create or replace function public.get_public_cart_quote_source(
 p_items jsonb,p_code text
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_store constant uuid:='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3';
 v_ids uuid[]:='{}'::uuid[];
 v_entry jsonb;
 v_id uuid;
 v_quantity integer;
 v_total_units integer:=0;
 v_found integer:=0;
 v_p public.products%rowtype;
 v_ship public.apex_store_shipping_settings%rowtype;
 v_promo public.supplier_discount_codes%rowtype;
 v_results jsonb:='[]'::jsonb;
 v_promo_json jsonb:=null;
 v_code text;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array'
  or jsonb_array_length(p_items) not between 1 and 20
  or p_code is null or length(p_code)>24
 then raise exception 'Invalid cart source request' using errcode='22023';end if;
 v_code:=btrim(p_code);
 if v_code<>'' and v_code !~ '^[A-Z0-9_-]{3,24}$'
 then raise exception 'Invalid cart code' using errcode='22023';end if;
 for v_entry in select value from jsonb_array_elements(p_items)
 loop
  if jsonb_typeof(v_entry)<>'object' or not v_entry ? 'product_id'
   or not v_entry ? 'quantity'
   or (select count(*) from jsonb_object_keys(v_entry))<>2
   or jsonb_typeof(v_entry->'product_id')<>'string'
   or (v_entry->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(v_entry->'quantity')<>'number'
   or (v_entry->>'quantity') !~ '^(?:[1-9]|10)$'
  then raise exception 'Invalid item' using errcode='22023';end if;
  v_id:=(v_entry->>'product_id')::uuid;
  v_quantity:=(v_entry->>'quantity')::integer;
  if v_id=any(v_ids) then
   raise exception 'Duplicate cart product' using errcode='22023';end if;
  v_ids:=array_append(v_ids,v_id);
  v_total_units:=v_total_units+v_quantity;
  if v_total_units>50 then
   raise exception 'Cart quantity limit' using errcode='22023';end if;
 end loop;

 -- Public metadata is not released until the independently reviewed gate.
 -- Never enable the gate here, even when product inventory is present.
 if not exists(select 1 from apex_internal.private_release_gate
               where singleton=true and enabled=true)
 then return jsonb_build_object('schema_version',1,'state','catalog_unavailable',
   'items','[]'::jsonb,'can_place_order',false,'can_pay',false);end if;

 select * into v_ship from public.apex_store_shipping_settings s
  where s.store_id=v_store;
 if not found or v_ship.charge_shipping is distinct from true
  or v_ship.flat_shipping_cents<1
  or v_ship.medium_flat_shipping_cents<v_ship.flat_shipping_cents
  or v_ship.free_shipping_min_subtotal_cents is null
 then return jsonb_build_object('schema_version',1,'state','catalog_unavailable',
    'items','[]'::jsonb,'can_place_order',false,'can_pay',false);end if;

 for v_found in 1..cardinality(v_ids)
 loop
  v_id:=v_ids[v_found];
  select p.* into v_p
  from public.products p
   join public.stores s on s.id=p.store_id
    and s.id=v_store and s.is_public=false
   join public.categories cat on cat.id=p.category_id
    and cat.store_id=p.store_id and cat.is_published=true
   join public.supplier_listing_controls ctl
    on ctl.store_id=p.store_id and ctl.product_id=p.id
    and ctl.supplier_wants_listing=true and ctl.admin_gate='clear'
    and (not ctl.republish_approval_required or ctl.republish_approved)
   join public.inventory_items inv
    on inv.store_id=p.store_id and inv.product_id=p.id
   join apex_internal.supplier_release_authorizations sa
    on sa.supplier_id=s.supplier_id
    and sa.status='verified' and sa.valid_until>=current_date
    and sa.reviewed_by is not null and sa.reviewed_at is not null
    and length(btrim(coalesce(sa.evidence_reference,'')))>0
   join apex_internal.product_release_authorizations pa
    on pa.store_id=p.store_id and pa.product_id=p.id
    and pa.status='verified' and pa.valid_until>=current_date
    and pa.reviewed_by is not null and pa.reviewed_at is not null
    and length(btrim(coalesce(pa.evidence_reference,'')))>0
   left join public.private_product_review_states reviews
    on reviews.store_id=p.store_id and reviews.product_id=p.id
   left join public.supplier_candidate_drafts link
    on link.store_id=p.store_id and link.product_id=p.id
   left join public.supplier_import_candidates src
    on src.store_id=p.store_id and src.id=link.candidate_id
  where p.id=v_id and p.store_id=v_store
    and p.is_published=false and p.is_active=true
    and p.currency='USD' and p.price_cents between 1 and 999999999
    and length(btrim(p.name)) between 1 and 120
    and length(btrim(coalesce(p.description,'')))>0
    and length(btrim(p.sku))>0 and length(coalesce(p.image_path,''))>0
    and inv.quantity_on_hand=0 and inv.quantity_reserved=0
    and coalesce(reviews.status,'') not in ('pending_review','changes_requested')
    and (link.candidate_id is null or src.review_status='approved_for_draft')
    and not exists(select 1 from apex_internal.listing_identity_holds h
      where h.supplier_id=s.supplier_id and h.active=true
        and h.signature=apex_internal.listing_signature(p.name));
  if not found then return jsonb_build_object(
    'schema_version',1,'state','cart_unavailable','items','[]'::jsonb,
    'can_place_order',false,'can_pay',false);end if;

  v_results:=v_results||jsonb_build_array(jsonb_build_object(
    'product_id',v_p.id,'name',v_p.name,'unit_price_cents',v_p.price_cents::text,
    'quantity', (p_items->(v_found-1)->>'quantity')::integer,
    'availability','sold_out','can_checkout',false));
 end loop;

 if v_code<>'' then
  select * into v_promo from public.supplier_discount_codes p
   where p.store_id=v_store and p.code=v_code;
  if found then
   v_promo_json:=jsonb_build_object(
    'code',v_promo.code,'is_active',v_promo.is_active,
    'discount_kind',v_promo.discount_kind,
    'discount_value',v_promo.discount_value,
    'min_subtotal_cents',v_promo.min_subtotal_cents,
    'starts_at',v_promo.starts_at,'ends_at',v_promo.ends_at,
    'usage_limit',v_promo.usage_limit,
    'redemption_count',v_promo.redemption_count);
  end if;
 end if;
 return jsonb_build_object(
  'schema_version',1,'state','rechecked_sold_out_cart',
  'items',v_results,
  'shipping',jsonb_build_object(
   'charge_shipping',v_ship.charge_shipping,
   'flat_shipping_cents',v_ship.flat_shipping_cents,
   'medium_flat_shipping_cents',v_ship.medium_flat_shipping_cents,
   'free_shipping_min_subtotal_cents',v_ship.free_shipping_min_subtotal_cents,
   'envelope_max_items',v_ship.envelope_max_items),
  'requested_code',v_code,'promotion',v_promo_json,
  'can_place_order',false,'can_create_invoice',false,
  'can_reserve_stock',false,'can_pay',false);
end $fn$;


do $postflight$
begin
 if has_function_privilege('anon',
 'public.save_private_store_usps_shipping_capacity(uuid,boolean,bigint,bigint,bigint,integer)','EXECUTE')
 or not has_function_privilege('authenticated',
 'public.save_private_store_usps_shipping_capacity(uuid,boolean,bigint,bigint,bigint,integer)','EXECUTE')
 or has_function_privilege('authenticated',
 'public.save_private_store_usps_shipping_settings(uuid,boolean,bigint,bigint,bigint)','EXECUTE')
 or has_table_privilege('authenticated','public.apex_store_shipping_settings','UPDATE')
 or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Envelope capacity permission postflight denied';end if;
end $postflight$;
commit;
