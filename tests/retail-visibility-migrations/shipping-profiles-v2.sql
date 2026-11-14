-- DISPOSABLE retail_test only: shipping profiles, RLS and v2 sanitized quote.
-- The product measurements are synthetic fixtures; never apply to production.
begin;
set local statement_timeout='20s';
do $guard$
begin
 if current_database()<>'retail_test' then
  raise exception 'Not the disposable retail_test database';end if;
end $guard$;

select set_config('test.actor','40000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.supplier_product_shipping_profiles
(store_id,product_id,length_mm,width_mm,height_mm,weight_g,flexible,updated_by)
values(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',
 270,210,130,1700,false,'40000000-0000-4000-8000-000000000001'
),(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',
 100,75,12,140,true,'40000000-0000-4000-8000-000000000001'
);
do $owner$
begin
 if (select count(*) from public.supplier_product_shipping_profiles
   where store_id='10000000-0000-4000-8000-000000000001')<>2
 then raise exception 'Supplier A cannot read their saved measurements';end if;
end $owner$;
reset role;

-- Anonymous callers have no direct table access, only the exact V2 function.
do $permissions$
begin
 if has_table_privilege('anon','public.supplier_product_shipping_profiles','SELECT')
  or has_table_privilege('anon','public.supplier_product_shipping_profiles','INSERT')
  or has_table_privilege('anon','public.supplier_product_shipping_profiles','UPDATE')
  or not has_function_privilege('anon',
   'public.get_public_retail_cart_quote_source_v2(jsonb,text)','EXECUTE')
 then raise exception 'Shipping profile direct permissions leaked';end if;
end $permissions$;

set local role anon;
do $anon$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source_v2(
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":2},
   {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]','TEST10');
 if v->>'state'<>'rechecked_inventory_cart' or v->>'schema_version'<>'2'
  or jsonb_array_length(v->'shipping_profiles')<>2
  or v#>>'{shipping_profiles,0,length_mm}'<>'270'
  or v#>>'{shipping_profiles,0,weight_g}'<>'1700'
  or v#>>'{shipping_profiles,1,flexible}'<>'true'
  or v#>>'{items,0,unit_price_cents}'<>'2499'
  or v->>'can_pay'<>'false'
  or v->>'can_place_order'<>'false'
  or v->>'can_reserve_stock'<>'false'
 then raise exception 'V2 photo/public projection and private shipping measurement quote were incorrect: %',v;end if;
 v:=public.get_public_retail_cart_quote_source_v2(
 '[{"product_id":"50000000-0000-4000-8000-000000000002","quantity":1}]','');
 if v->>'state'<>'rechecked_inventory_cart'
   or v#>'{shipping_profiles,0}'<>'null'::jsonb
 then raise exception 'Unprofiled item should return explicit null profile';end if;
 v:=public.get_public_retail_cart_quote_source_v2(
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
   {"product_id":"50000000-0000-4000-8000-000000000004","quantity":1}]','');
 if v->>'state'<>'cart_unavailable' then
  raise exception 'V2 cross-store cart visibility not enforced';end if;
end $anon$;
reset role;

-- A different supplier cannot read or mutate A's profile rows.
select set_config('test.actor','40000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $isolation$
begin
 if (select count(*) from public.supplier_product_shipping_profiles)<>0
 then raise exception 'Cross-supplier shipping profile read leaked';end if;
 update public.supplier_product_shipping_profiles
  set weight_g=50
  where store_id='10000000-0000-4000-8000-000000000001';
 if found then raise exception 'Cross-supplier shipping mutation succeeded';end if;
 begin
  insert into public.supplier_product_shipping_profiles
  (store_id,product_id,length_mm,width_mm,height_mm,weight_g,flexible,updated_by)
  values('10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',50,50,50,100,false,
  '40000000-0000-4000-8000-000000000002');
  raise exception 'Cross-supplier shipping insert succeeded';
 exception when insufficient_privilege then null;end;
end $isolation$;
reset role;

-- The separate V1 function is unchanged and has no shipping profiles.
do $v1$
declare v jsonb;
begin
 v:=public.get_public_retail_cart_quote_source(
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','');
 if v->>'schema_version'<>'1' or v?'shipping_profiles'
 then raise exception 'Legacy checkout contract was mutated';end if;
end $v1$;

-- Audited profile edits do not alter stock, inventory reservations or checkout.
do $audit$
begin
 if (select count(*) from public.supplier_catalog_audit
  where entity_type='supplier_product_shipping_profiles'
   and operation='INSERT')<>2 then
  raise exception 'Shipping updates were not audited';end if;
 if (select count(*) from public.inventory_items where quantity_reserved<>0)<>0
 then raise exception 'Shipping quote changed reserved inventory';end if;
end $audit$;
rollback;
