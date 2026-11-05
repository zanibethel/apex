-- Track 1: production-shaped public quote policy in a DISPOSABLE database.
-- Uses a separate, synthetic founding store and rolls back every fixture write.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $pre$
begin
 if current_database()<>'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
  or has_table_privilege('anon','public.apex_store_shipping_settings','SELECT')
  or has_table_privilege('anon','public.inventory_items','SELECT')
 then raise exception 'Public optional-shipping fixture requires isolated gate-off CI';end if;
end $pre$;

insert into public.suppliers(id,slug,display_name)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d4',
 'track1-optional-quote-fixture','Synthetic Track 1 supplier');
insert into public.stores(id,supplier_id,slug,display_name,is_public)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d4',
 'track1-quote-fixture','Synthetic Track 1 store',false);
insert into public.categories(id,store_id,slug,name,is_published)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d5',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3','synthetic','Synthetic category',true);
insert into public.products(id,store_id,category_id,sku,name,description,
 price_cents,currency,is_published,is_active,image_path)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d5',
 'SYNTH-OPTIONAL-SHIPPING','Synthetic approved test item',
 'Nonmedical, synthetic isolated database test item',
 20000,'USD',false,true,'synthetic/private/object.png');
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6',0,0);
insert into public.supplier_listing_controls
(store_id,product_id,supplier_wants_listing,admin_gate)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6',true,'clear');
insert into apex_internal.supplier_release_authorizations
(supplier_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d4','verified',current_date+1,
 now(),'00000000-0000-0000-0000-000000000001','synthetic-only/supplier');
insert into apex_internal.product_release_authorizations
(store_id,product_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6',
 'verified',current_date+1,now(),
 '00000000-0000-0000-0000-000000000002','synthetic-only/product');

insert into public.apex_store_shipping_settings(
 store_id,charge_shipping,flat_shipping_cents,
 medium_flat_shipping_cents,free_shipping_min_subtotal_cents,
 envelope_max_items,updated_by)
values('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3',
 true,1500,2580,20001,4,'00000000-0000-0000-0000-000000000001');

-- The cart remains private while the gate is false, even for fully approved rows.
do $closed$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6","quantity":1}]'::jsonb,'');
 if r->>'state'<>'catalog_unavailable' then
  raise exception 'Fully prepared but globally unreleased item leaked';end if;
end $closed$;

-- Opening the global gate exists ONLY inside this rolled-back, disposable CI transaction.
update apex_internal.private_release_gate set enabled=true where singleton=true;

set local role anon;
do $paid$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6","quantity":1}]'::jsonb,'');
 if r->>'state'<>'rechecked_inventory_cart'
  or r#>>'{shipping,charge_shipping}'<>'true'
  or r#>>'{shipping,flat_shipping_cents}'<>'1500'
  or r#>>'{shipping,medium_flat_shipping_cents}'<>'2580'
  or r#>>'{shipping,free_shipping_min_subtotal_cents}'<>'20001'
  or r#>>'{items,0,unit_price_cents}'<>'20000'
  or r#>>'{items,0,availability}'<>'sold_out'
  or r->>'can_pay'<>'false'
  or r->>'can_place_order'<>'false'
  or r->>'can_reserve_stock'<>'false'
  or r->>'can_create_invoice'<>'false'
  or r ? 'source_cost_cents' or r ? 'quantity_on_hand'
 then raise exception 'Paid public shipping quote violated release or privacy contract';end if;
end $paid$;
reset role;

-- Supplier explicitly chooses optional zero-fee shipping.
update public.apex_store_shipping_settings
 set charge_shipping=false,flat_shipping_cents=0,
     medium_flat_shipping_cents=0,free_shipping_min_subtotal_cents=null
 where store_id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3';

set local role anon;
do $waived$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6","quantity":1}]'::jsonb,'');
 if r->>'state'<>'rechecked_inventory_cart'
  or r#>>'{shipping,charge_shipping}'<>'false'
  or r#>>'{shipping,flat_shipping_cents}'<>'0'
  or r#>>'{shipping,medium_flat_shipping_cents}'<>'0'
  or (r->'shipping'->'free_shipping_min_subtotal_cents')<>'null'::jsonb
  or r->>'can_pay'<>'false'
  or r->>'can_place_order'<>'false'
 then raise exception 'No-fee public shipping quote rejected or became payable';end if;
end $waived$;
reset role;

-- A paid rate can also have no promotional free-shipping minimum.
update public.apex_store_shipping_settings
 set charge_shipping=true,flat_shipping_cents=1500,
     medium_flat_shipping_cents=2580,free_shipping_min_subtotal_cents=null
 where store_id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3';

set local role anon;
do $no_threshold$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6","quantity":1}]'::jsonb,'');
 if r->>'state'<>'rechecked_inventory_cart'
  or r#>>'{shipping,charge_shipping}'<>'true'
  or r#>>'{shipping,flat_shipping_cents}'<>'1500'
  or r->'shipping'->'free_shipping_min_subtotal_cents'<>'null'::jsonb
 then raise exception 'Paid shipping with optional threshold was denied';end if;
end $no_threshold$;
reset role;

-- Admin hold is stronger than free shipping and all release evidence.
update public.supplier_listing_controls set admin_gate='hold'
where store_id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3';
set local role anon;
do $held$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"bb3a8fe2-48d0-4b0a-938e-e435fe87d7d6","quantity":1}]'::jsonb,'');
 if r->>'state'<>'cart_unavailable'
  or r->>'can_pay'<>'false'
 then raise exception 'Admin hold bypassed by public quote';end if;
end $held$;
reset role;

rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or exists(select 1 from public.stores
    where id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3')
  or has_table_privilege('anon','public.inventory_items','SELECT')
  or exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Synthetic test changed persistent state or commerce gate';end if;
end $post$;
select 'PASS: public optional shipping, no threshold, admin hold, rollback';
