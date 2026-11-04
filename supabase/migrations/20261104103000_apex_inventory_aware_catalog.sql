-- PR #207 - live-read catalog availability with independent seller/item
-- authorization, existing supplier intent / admin hold, and current inventory.
-- No public-release activation, checkout, order writes or public media.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.private_release_gate') is null
  or to_regclass('apex_internal.supplier_release_authorizations') is null
  or to_regclass('apex_internal.product_release_authorizations') is null
  or to_regclass('apex_internal.listing_identity_holds') is null
  or to_regprocedure('public.get_public_cart_quote_source(jsonb,text)') is null
  or to_regprocedure('public.get_public_sold_out_catalog(integer,integer)') is null
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Inventory-aware public catalog preflight denied';end if;
end $preflight$;

create function public.get_public_inventory_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000 or
  p_limit is null or p_limit<1 or p_limit>24
 then raise exception 'Invalid catalog page' using errcode='22023';end if;
 if not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,
  'name',eligible.name,
  'description',eligible.description,
  'price_cents',eligible.price_cents::text,
  'currency','USD',
  'availability',eligible.availability,
  'can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents,
   case when i.quantity_on_hand>i.quantity_reserved
    then 'in_stock' else 'sold_out' end as availability
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories cat on cat.id=p.category_id
   and cat.store_id=p.store_id and cat.is_published=true
  join public.supplier_listing_controls c
   on c.store_id=p.store_id and c.product_id=p.id
   and c.supplier_wants_listing=true and c.admin_gate='clear'
   and (not c.republish_approval_required or c.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id
   and i.product_id=p.id and i.quantity_on_hand>=0
   and i.quantity_reserved between 0 and i.quantity_on_hand
  join apex_internal.supplier_release_authorizations sa
   on sa.supplier_id=s.supplier_id and sa.status='verified'
   and sa.valid_until>=current_date
   and sa.reviewed_at is not null and sa.reviewed_by is not null
   and length(btrim(coalesce(sa.evidence_reference,'')))>0
  join apex_internal.product_release_authorizations pa
   on pa.store_id=p.store_id and pa.product_id=p.id
   and pa.status='verified' and pa.valid_until>=current_date
   and pa.reviewed_at is not null and pa.reviewed_by is not null
   and length(btrim(coalesce(pa.evidence_reference,'')))>0
  left join public.private_product_review_states r
   on r.store_id=p.store_id and r.product_id=p.id
  left join public.supplier_candidate_drafts link
   on link.store_id=p.store_id and link.product_id=p.id
  left join public.supplier_import_candidates src
   on src.store_id=p.store_id and src.id=link.candidate_id
  where p.is_published=false and p.is_active=true and p.currency='USD'
   and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,''))) between 1 and 1500
   and length(coalesce(p.image_path,''))>0
   and coalesce(r.status,'') not in ('pending_review','changes_requested')
   and (link.candidate_id is null or src.review_status='approved_for_draft')
   and not exists(select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name))
  order by p.name,p.id
  limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $fn$;

revoke all on function public.get_public_inventory_catalog(integer,integer)
 from public,anon,authenticated;
grant execute on function public.get_public_inventory_catalog(integer,integer)
 to anon,authenticated;

-- Preserve the older sold-out-only API as actually zero stock. A positive
-- quantity must NEVER be presented as SOLD OUT by a legacy consumer.
create or replace function public.get_public_sold_out_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000
   or p_limit is null or p_limit<1 or p_limit>24
 then raise exception 'Invalid catalog page' using errcode='22023';end if;
 if not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,'name',eligible.name,
  'description',eligible.description,
  'price_cents',eligible.price_cents::text,
  'currency','USD','availability','sold_out','can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories cat on cat.id=p.category_id
     and cat.store_id=p.store_id and cat.is_published=true
  join public.supplier_listing_controls c on c.store_id=p.store_id
     and c.product_id=p.id and c.supplier_wants_listing=true
     and c.admin_gate='clear'
     and (not c.republish_approval_required or c.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
  join apex_internal.supplier_release_authorizations sa
    on sa.supplier_id=s.supplier_id and sa.status='verified'
    and sa.valid_until>=current_date
    and sa.reviewed_at is not null and sa.reviewed_by is not null
    and length(btrim(coalesce(sa.evidence_reference,'')))>0
  join apex_internal.product_release_authorizations pa
    on pa.store_id=p.store_id and pa.product_id=p.id
    and pa.status='verified' and pa.valid_until>=current_date
    and pa.reviewed_at is not null and pa.reviewed_by is not null
    and length(btrim(coalesce(pa.evidence_reference,'')))>0
  left join public.private_product_review_states r on r.store_id=p.store_id
    and r.product_id=p.id
  left join public.supplier_candidate_drafts link on link.store_id=p.store_id
    and link.product_id=p.id
  left join public.supplier_import_candidates src on src.store_id=p.store_id
    and src.id=link.candidate_id
  where p.is_published=false and p.is_active=true and p.currency='USD'
   and p.price_cents>0 and length(btrim(p.name))>0
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,'')))>0
   and length(coalesce(p.image_path,''))>0
   and i.quantity_on_hand=0 and i.quantity_reserved=0
   and coalesce(r.status,'') not in ('pending_review','changes_requested')
   and (link.candidate_id is null or src.review_status='approved_for_draft')
   and not exists(
    select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
      and h.signature=apex_internal.listing_signature(p.name)
   )
  order by p.name,p.id
  limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $fn$;
-- Replace any legacy no-argument public feed with the same strict filter.
-- An explicit two-argument signature avoids PostgREST overload ambiguity.
create or replace function public.get_public_sold_out_catalog()
 returns jsonb language sql stable security definer set search_path=pg_catalog as $legacy$
 select public.get_public_sold_out_catalog(0,24);
$legacy$;

-- Update saved-cart readback with the same nonpayable stock interpretation.
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
 v_available integer;
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
    and inv.quantity_on_hand>=0
    and inv.quantity_reserved between 0 and inv.quantity_on_hand
    and coalesce(reviews.status,'') not in ('pending_review','changes_requested')
    and (link.candidate_id is null or src.review_status='approved_for_draft')
    and not exists(select 1 from apex_internal.listing_identity_holds h
      where h.supplier_id=s.supplier_id and h.active=true
        and h.signature=apex_internal.listing_signature(p.name));
  if not found then return jsonb_build_object(
    'schema_version',1,'state','cart_unavailable','items','[]'::jsonb,
    'can_place_order',false,'can_pay',false);end if;

  -- The display stock indication is freshly read from saved inventory.
  -- This is never a reservation and gives no checkout rights.
  select i.quantity_on_hand-i.quantity_reserved into v_available
  from public.inventory_items i
  where i.store_id=v_store and i.product_id=v_id
   and i.quantity_on_hand>=0
   and i.quantity_reserved between 0 and i.quantity_on_hand;
  if not found or v_available is null then
   return jsonb_build_object(
    'schema_version',1,'state','cart_unavailable','items','[]'::jsonb,
    'can_place_order',false,'can_pay',false);end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object(
    'product_id',v_p.id,'name',v_p.name,'unit_price_cents',v_p.price_cents::text,
    'quantity', (p_items->(v_found-1)->>'quantity')::integer,
    'availability',case
      when v_available>=v_quantity then 'in_stock'
      when v_available>0 then 'insufficient_stock'
      else 'sold_out' end,
    'can_checkout',false));
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
  'schema_version',1,'state','rechecked_inventory_cart',
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
declare v jsonb;
begin
 v:=public.get_public_inventory_catalog(0,24);
 if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>0
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
  or has_table_privilege('anon','public.inventory_items','SELECT')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
  or not has_function_privilege('anon','public.get_public_inventory_catalog(integer,integer)','EXECUTE')
 then raise exception 'Inventory-aware catalog postflight denied';end if;
end $postflight$;
commit;
