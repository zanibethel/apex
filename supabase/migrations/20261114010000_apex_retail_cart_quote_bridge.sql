-- Track 1 -> Track 2 prerequisite: price the same publicly visible retail
-- products shown by the current retail catalog. READ-ONLY. No orders, inventory
-- reservations, customer data, BTCPay requests, or merchant activation.
-- Keep older private-release quote RPC intact for historical compatibility.
begin;

create or replace function public.get_public_retail_cart_quote_source(
 p_items jsonb,p_code text
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_entry jsonb;
 v_id uuid;
 v_seen uuid[]:='{}'::uuid[];
 v_quantity integer;
 v_total_units integer:=0;
 v_product public.products%rowtype;
 v_store uuid;
 v_shipping public.apex_store_shipping_settings%rowtype;
 v_promo public.supplier_discount_codes%rowtype;
 v_available integer;
 v_lines jsonb:='[]'::jsonb;
 v_promotion jsonb:=null;
 v_code text;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array'
  or jsonb_array_length(p_items) not between 1 and 20
  or p_code is null or length(p_code)>24
 then raise exception 'Invalid retail cart' using errcode='22023';end if;
 v_code:=p_code;
 if v_code<>'' and v_code !~ '^[A-Z0-9_-]{3,24}$'
 then raise exception 'Invalid promotion format' using errcode='22023';end if;

 -- The identical independent display switch used by the visible catalog.
 if not exists(select 1 from apex_internal.retail_showcase_gate
    where singleton=true and enabled=true)
 then return jsonb_build_object('schema_version',1,
   'state','catalog_unavailable','items','[]'::jsonb,
   'can_place_order',false,'can_pay',false);end if;

 for v_entry in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_entry)<>'object' or
   (select count(*) from jsonb_object_keys(v_entry))<>2 or
   not v_entry ? 'product_id' or not v_entry ? 'quantity' or
   jsonb_typeof(v_entry->'product_id')<>'string' or
   (v_entry->>'product_id') !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
   jsonb_typeof(v_entry->'quantity')<>'number' or
   (v_entry->>'quantity') !~ '^(?:[1-9]|10)$'
  then raise exception 'Invalid retail cart item' using errcode='22023';end if;
  v_id:=(v_entry->>'product_id')::uuid;
  v_quantity:=(v_entry->>'quantity')::integer;
  if v_id=any(v_seen) then
   raise exception 'Duplicate retail cart item' using errcode='22023';end if;
  v_seen:=array_append(v_seen,v_id);
  v_total_units:=v_total_units+v_quantity;
  if v_total_units>50 then
   raise exception 'Retail cart quantity exceeded' using errcode='22023';end if;

  -- Match the current public retail catalog admission checks, not the old
  -- private_release_gate, legacy category publication, or name keyword rules.
  select p.* into v_product
  from public.products p
   join public.stores s on s.id=p.store_id and s.is_public=false
   left join public.categories c on c.id=p.category_id and c.store_id=p.store_id
   join public.supplier_listing_controls lc on
    lc.store_id=p.store_id and lc.product_id=p.id
    and lc.supplier_wants_listing=true and lc.admin_gate='clear'
    and (not lc.republish_approval_required or lc.republish_approved)
  where p.id=v_id and
   (p.category_id is null or
    apex_internal.retail_showcase_category_allowed(p.store_id,c.id))
   and p.archived_at is null and p.is_published=false and p.is_active=true
   and p.currency='USD' and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,''))) between 1 and 1500
   and not exists(select 1 from apex_internal.retail_product_visibility_restrictions b
    where b.store_id=p.store_id and b.product_id=p.id and b.is_restricted=true)
   and not exists(select 1 from public.private_product_review_states r
    where r.store_id=p.store_id and r.product_id=p.id
     and r.status in ('pending_review','changes_requested'))
   and not exists(select 1 from public.supplier_candidate_drafts d
    where d.store_id=p.store_id and d.product_id=p.id)
   and not exists(select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name));

  if not found or (v_store is not null and v_product.store_id<>v_store)
  then return jsonb_build_object('schema_version',1,
    'state','cart_unavailable','items','[]'::jsonb,
    'can_place_order',false,'can_pay',false);end if;
  v_store:=v_product.store_id;

  -- An absent or inconsistent ledger is displayed as Sold Out. The public
  -- receives availability labels, never private inventory numbers.
  select i.quantity_on_hand-i.quantity_reserved into v_available
  from public.inventory_items i
  where i.store_id=v_store and i.product_id=v_id and
   i.quantity_on_hand>=0 and i.quantity_reserved between 0 and i.quantity_on_hand;
  if not found then v_available:=0;end if;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
   'product_id',v_id,'name',v_product.name,
   'unit_price_cents',v_product.price_cents::text,'quantity',v_quantity,
   'availability',case
    when v_available>=v_quantity then 'in_stock'
    when v_available>0 then 'insufficient_stock'
    else 'sold_out' end,
   'can_checkout',false));
 end loop;

 select * into v_shipping from public.apex_store_shipping_settings s
 where s.store_id=v_store;
 if not found
  or v_shipping.charge_shipping is null
  or v_shipping.envelope_max_items not between 1 and 50
  or v_shipping.flat_shipping_cents not between 0 and 999999999
  or v_shipping.medium_flat_shipping_cents not between 0 and 999999999
  or (v_shipping.free_shipping_min_subtotal_cents is not null and
     v_shipping.free_shipping_min_subtotal_cents not between 1 and 999999999)
  or (v_shipping.charge_shipping and
     (v_shipping.flat_shipping_cents<1 or
      v_shipping.medium_flat_shipping_cents<v_shipping.flat_shipping_cents))
  or (not v_shipping.charge_shipping and
     (v_shipping.flat_shipping_cents<>0 or
      v_shipping.medium_flat_shipping_cents<>0 or
      v_shipping.free_shipping_min_subtotal_cents is not null))
 then return jsonb_build_object('schema_version',1,
  'state','catalog_unavailable','items','[]'::jsonb,
  'can_place_order',false,'can_pay',false);end if;

 if v_code<>'' then
  select * into v_promo from public.supplier_discount_codes d
  where d.store_id=v_store and d.code=v_code;
  if found then
   v_promotion:=jsonb_build_object(
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
  'items',v_lines,
  'shipping',jsonb_build_object(
   'charge_shipping',v_shipping.charge_shipping,
   'flat_shipping_cents',v_shipping.flat_shipping_cents,
   'medium_flat_shipping_cents',v_shipping.medium_flat_shipping_cents,
   'free_shipping_min_subtotal_cents',v_shipping.free_shipping_min_subtotal_cents,
   'envelope_max_items',v_shipping.envelope_max_items),
  'requested_code',v_code,'promotion',v_promotion,
  'can_place_order',false,'can_create_invoice',false,
  'can_reserve_stock',false,'can_pay',false);
end $fn$;

-- Public invocation is intentionally constrained to the sanitized projection.
-- Neither the private tables nor any commerce writer receive extra grants.
revoke all on function public.get_public_retail_cart_quote_source(jsonb,text)
 from public,anon,authenticated;
grant execute on function public.get_public_retail_cart_quote_source(jsonb,text)
 to anon,authenticated;
commit;
