-- Disposable PostgreSQL only. Run AFTER retail visibility assertions and after
-- the new read-only retail cart migration. Never create live customer orders.
do $$
begin
 if has_table_privilege('anon','public.products','SELECT') or
    has_table_privilege('anon','public.inventory_items','SELECT') or
    has_table_privilege('anon','public.supplier_discount_codes','SELECT') or
    has_table_privilege('anon','public.apex_store_shipping_settings','SELECT') or
    not has_function_privilege('anon',
       'public.get_public_retail_cart_quote_source(jsonb,text)','EXECUTE')
 then raise exception 'Retail quote leaked private table privilege';end if;
end $$;

set role anon;
do $$
declare
 v jsonb;
 v_items jsonb:='[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":2},
  {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]'::jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(v_items,'');
 if v->>'state'<>'rechecked_inventory_cart'
    or jsonb_array_length(v->'items')<>2
    or v->'items'->0->>'unit_price_cents'<>'2499'
    or v->'items'->1->>'unit_price_cents'<>'3999'
    or v->'items'->0->>'availability'<>'sold_out'
    or v->'items'->1->>'availability'<>'sold_out'
    or v->'items'->0->>'can_checkout'<>'false'
    or v->>'can_place_order'<>'false'
    or v->>'can_create_invoice'<>'false'
    or v->>'can_reserve_stock'<>'false'
    or v->>'can_pay'<>'false'
    or v->'shipping'->>'flat_shipping_cents'<>'1500'
    or v->'shipping'->>'medium_flat_shipping_cents'<>'2580'
    or v->'shipping'->>'free_shipping_min_subtotal_cents'<>'20001'
 then raise exception 'Catalog-aligned nonpayable quote mismatch: %',v;end if;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','TEST10');
 if v->'promotion'->>'code'<>'TEST10' or
    v->'promotion'->>'discount_kind'<>'percentage'
 then raise exception 'Active saved promotion missing: %',v;end if;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','BADCODE');
 if v->'promotion'<>'null'::jsonb
 then raise exception 'Unknown code should not invent a discount';end if;
 -- Supplier has not published the cap, and an admin explicitly holds product 3.
 foreach v_items in array ARRAY[
  '[{"product_id":"50000000-0000-4000-8000-000000000002","quantity":1}]'::jsonb,
  '[{"product_id":"50000000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
  '[{"product_id":"50000000-0000-4000-8000-000000000004","quantity":1}]'::jsonb
 ] loop
  v:=public.get_public_retail_cart_quote_source(v_items,'');
  if v->>'state'<>'cart_unavailable'
  then raise exception 'Unpublished, restricted or cross-tenant product leaked: %',v;end if;
 end loop;
end $$;
reset role;

-- A row with 1 free unit must not be quoted as sufficient for two units.
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
values('10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',2,1);
set role anon;
do $$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":2}]','');
 if v->'items'->0->>'availability'<>'insufficient_stock'
 then raise exception 'Expected insufficient stock';end if;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','');
 if v->'items'->0->>'availability'<>'in_stock'
 then raise exception 'Expected one in-stock unit';end if;
end $$;
reset role;

-- Repricing is observed fresh; no buyer-supplied dollar amount exists.
update public.products set price_cents=2999 where
 id='50000000-0000-4000-8000-000000000001';
set role anon;
do $$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','');
 if v->'items'->0->>'unit_price_cents'<>'2999'
 then raise exception 'Price was stale or buyer-supplied';end if;
end $$;
reset role;

-- Admin can hide a previously visible product after it has been selected.
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"platform_admin"}}',false);
select public.set_admin_retail_product_restriction(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',true,'Product review hold');
set role anon;
do $$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]','');
 if v->>'state'<>'cart_unavailable'
 then raise exception 'Admin visibility hold did not revoke quote';end if;
end $$;
reset role;
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select public.set_admin_retail_product_restriction(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',false,'Review completed');

-- Deliberately publish another supplier fixture in disposable DB only.
insert into public.supplier_listing_controls(store_id,product_id,product_name,product_sku,supplier_wants_listing)
values('10000000-0000-4000-8000-000000000002',
 '50000000-0000-4000-8000-000000000004','Other Supplier Shirt','SHIRT-002',true);
set role anon;
do $$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
    {"product_id":"50000000-0000-4000-8000-000000000004","quantity":1}]','');
 if v->>'state'<>'cart_unavailable'
 then raise exception 'Cross-store cart must require an explicit split-order design';end if;
end $$;
-- The shared visibility gate blocks quote without changing supplier preferences.
reset role;
update apex_internal.retail_showcase_gate set enabled=false where singleton=true;
set role anon;
do $$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','');
 if v->>'state'<>'catalog_unavailable'
 then raise exception 'Disabled retail gate leaked quote';end if;
end $$;
reset role;
update apex_internal.retail_showcase_gate set enabled=true where singleton=true;

-- Malformed selections fail closed; no cart, checkout, or stock mutation occurs.
do $$
begin
 begin
  perform public.get_public_retail_cart_quote_source(
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
     {"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','');
  raise exception 'Expected duplicate cart rejection';
 exception when others then
  if SQLERRM='Expected duplicate cart rejection' then raise;end if;
 end;
 begin
  perform public.get_public_retail_cart_quote_source(
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":11}]','');
  raise exception 'Expected quantity rejection';
 exception when others then
  if SQLERRM='Expected quantity rejection' then raise;end if;
 end;
end $$;
