-- Isolated CI retail_test only: controlled in-stock product in a real
-- PostgreSQL cart quote. All mutations are synthetic and rolled back.
begin;
update public.products set price_cents=5999
 where id='50000000-0000-4000-8000-000000000001';
update public.inventory_items set quantity_on_hand=4,quantity_reserved=0
 where product_id='50000000-0000-4000-8000-000000000001';
update public.apex_store_shipping_settings set envelope_max_items=2
 where store_id='10000000-0000-4000-8000-000000000001';
insert into public.supplier_discount_codes(
 id,store_id,code,discount_kind,discount_value,min_subtotal_cents
) values(
 '70000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000001','SHIPFREE','free_shipping',1,0
);
set local role anon;
do $test$
declare
 p uuid:='50000000-0000-4000-8000-000000000001';
 q integer;
 v jsonb;
begin
 foreach q in array ARRAY[1,2,3,4,5] loop
  v:=public.get_public_retail_cart_quote_source(
   jsonb_build_array(jsonb_build_object('product_id',p,'quantity',q)), '');
  if v->>'state'<>'rechecked_inventory_cart'
    or v->'items'->0->>'unit_price_cents'<>'5999'
    or v->'items'->0->>'quantity'<>q::text
    or v->'items'->0->>'availability'<>case when q<=4 then 'in_stock' else 'insufficient_stock' end
    or v->>'can_place_order'<>'false'
    or v->>'can_pay'<>'false'
    or v->>'can_create_invoice'<>'false'
    or v->>'can_reserve_stock'<>'false'
    or v->'shipping'->>'envelope_max_items'<>'2'
   then raise exception 'Server-authoritative stock/price/permissions failed for quantity %: %',q,v;
  end if;
 end loop;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":3}]','TEST10');
 if v->'promotion'->>'discount_kind'<>'percentage'
   or v->'promotion'->>'discount_value'<>'10'
 then raise exception 'Server TEST10 promotion not found';end if;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":4}]','SHIPFREE');
 if v->'promotion'->>'discount_kind'<>'free_shipping'
 then raise exception 'Server free shipping promotion not found';end if;
 v:=public.get_public_retail_cart_quote_source(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','BADCODE');
 if v->'promotion'<>'null'::jsonb
 then raise exception 'Unknown promotion was treated as valid';end if;
end $test$;
reset role;
do $stock$
begin
 if (select quantity_on_hand from public.inventory_items
     where product_id='50000000-0000-4000-8000-000000000001')<>4 or
    (select quantity_reserved from public.inventory_items
     where product_id='50000000-0000-4000-8000-000000000001')<>0
 then raise exception 'Read-only cart QA changed synthetic inventory';end if;
end $stock$;
rollback;
