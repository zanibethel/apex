-- Track 1: isolated PostgreSQL, synthetic previously reviewed product.
-- Gate may become true only inside a transaction that is always rolled back.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pre$
begin
 if current_database()<>'apex_test' or
  (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Category read fixture must start in gate-closed isolated DB';end if;
end $pre$;

update apex_internal.private_release_gate set enabled=true where singleton=true;
set local role anon;
do $allowed$
declare r jsonb; item jsonb;
begin
 r:=public.get_public_inventory_catalog(0,24);
 if jsonb_array_length(r)<>1 then raise exception 'Expected one independently approved product';end if;
 item:=r->0;
 if item->>'category_id'<>'63000000-0000-0000-0000-000000000001'
  or item->>'category_name'<>'Synthetic category'
  or item->>'can_checkout'<>'false'
  or item->>'availability'<>'sold_out'
  or (select count(*) from jsonb_object_keys(item))<>9
  or item ? 'image_path' or item ? 'quantity_on_hand'
  or item ? 'internal_source_cost_cents' or item ? 'wallet'
  or item ? 'supplier_id'
 then raise exception 'Category projection leaked or misrepresented public fields';end if;
end $allowed$;
reset role;

-- The category itself must be published; otherwise the product disappears.
update public.categories set is_published=false
 where id='63000000-0000-0000-0000-000000000001';
set local role anon;
do $denied$
begin
 if jsonb_array_length(public.get_public_inventory_catalog(0,24))<>0
 then raise exception 'Unpublished category leaked product';end if;
end $denied$;
reset role;

-- The global gate is stronger than a published category.
update public.categories set is_published=true
 where id='63000000-0000-0000-0000-000000000001';
update apex_internal.private_release_gate set enabled=false where singleton=true;
set local role anon;
do $gated$
begin
 if jsonb_array_length(public.get_public_inventory_catalog(0,24))<>0
 then raise exception 'Gate-off product/category leaked';end if;
end $gated$;
reset role;
rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or has_table_privilege('anon','public.inventory_items','SELECT')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
  or exists(select 1 from apex_internal.checkout_order_intents)
 then raise exception 'Category test left unauthorized state';end if;
end $post$;
select 'PASS: public categories only after release; gate, stock and admin protections intact';
