-- Verify private stock preference role isolation in disposable PostgreSQL.
\set ON_ERROR_STOP on
begin;

insert into public.suppliers(id,slug,display_name) values
 ('a6000000-0000-4000-8000-000000000001','stock-fixture-a','Stock Fixture A'),
 ('a6000000-0000-4000-8000-000000000002','stock-fixture-b','Stock Fixture B');
insert into public.stores(id,supplier_id,slug,display_name,is_public) values
 ('b6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','stock-fixture-a','Stock Fixture A',false),
 ('b6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000002','stock-fixture-b','Stock Fixture B',false);
insert into public.supplier_memberships(supplier_id,user_id,role) values
 ('a6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('a6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000002','staff'),
 ('a6000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000003','manager');
insert into public.products(id,store_id,sku,name,price_cents,is_published) values
 ('c6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','STOCK-A','Synthetic draft A',1000,false),
 ('c6000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000002','STOCK-B','Synthetic draft B',1000,false),
 ('c6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001','STOCK-PUBLISHED','Synthetic published',1000,true);
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved) values
 ('b6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001',5,2);

do $permissions$
begin
 if has_table_privilege('anon','public.supplier_private_stock_preferences','SELECT') or
  has_table_privilege('anon','public.supplier_private_stock_preferences','INSERT') or
  has_table_privilege('authenticated','public.supplier_private_stock_preferences','DELETE') or
  has_column_privilege('authenticated','public.supplier_private_stock_preferences','store_id','UPDATE') or
  has_column_privilege('authenticated','public.supplier_private_stock_preferences','product_id','UPDATE') or
  not has_column_privilege('authenticated','public.supplier_private_stock_preferences','track_quantities','UPDATE') or
  not (select relrowsecurity and relforcerowsecurity from pg_class
   where oid='public.supplier_private_stock_preferences'::regclass)
 then raise exception 'Stock preference grants or forced RLS incorrect';end if;
end $permissions$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
insert into public.supplier_private_stock_preferences
 (store_id,product_id,track_quantities)
values('b6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001',false);
do $owner$
begin
 if (select count(*) from public.supplier_private_stock_preferences)<>1 or
 not exists(select 1 from public.supplier_private_stock_preferences
  where track_quantities=false and changed_by=auth.uid())
 then raise exception 'Owner unable to save private stock preference';end if;
end $owner$;
update public.supplier_private_stock_preferences set track_quantities=true
where store_id='b6000000-0000-4000-8000-000000000001'
 and product_id='c6000000-0000-4000-8000-000000000001';
do $owner_update$
begin
 if not exists(select 1 from public.supplier_private_stock_preferences
 where track_quantities=true) then raise exception 'Owner update failed';end if;
end $owner_update$;

-- A published item cannot receive this private draft preference.
do $published$
declare rejected boolean:=false;
begin
 begin
  insert into public.supplier_private_stock_preferences
  (store_id,product_id,track_quantities)
  values('b6000000-0000-4000-8000-000000000001',
   'c6000000-0000-4000-8000-000000000003',false);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Published item accepted private preference';end if;
end $published$;

-- No staff access, even within the same supplier.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $staff$
declare rejected boolean:=false;
begin
 if exists(select 1 from public.supplier_private_stock_preferences)
 then raise exception 'Staff can read stock preference';end if;
 begin
  insert into public.supplier_private_stock_preferences
  (store_id,product_id,track_quantities)
  values('b6000000-0000-4000-8000-000000000001',
   'c6000000-0000-4000-8000-000000000001',false);
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Staff can insert stock preference';end if;
end $staff$;

-- Another store manager can neither read nor change the first supplier.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $cross$
declare rejected boolean:=false;
begin
 if exists(select 1 from public.supplier_private_stock_preferences)
 then raise exception 'Other supplier can read stock preference';end if;
 begin
  update public.supplier_private_stock_preferences
  set track_quantities=false
  where store_id='b6000000-0000-4000-8000-000000000001';
 exception when others then rejected:=true;end;
 if exists(select 1 from public.supplier_private_stock_preferences
  where store_id='b6000000-0000-4000-8000-000000000001')
 then raise exception 'Cross-store preference leaked';end if;
end $cross$;
reset role;

do $no_commerce_changes$
begin
 if exists(select 1 from public.inventory_items
  where product_id='c6000000-0000-4000-8000-000000000001'
  and (quantity_on_hand<>5 or quantity_reserved<>2))
 then raise exception 'Stock preference modified inventory';end if;
 if exists(select 1 from public.products
  where id in ('c6000000-0000-4000-8000-000000000001',
   'c6000000-0000-4000-8000-000000000002')
  and is_published)
 then raise exception 'Stock preference modified publication';end if;
end $no_commerce_changes$;

rollback;
select 'PASS: private stock preference owner/manager RLS; no anonymous, staff, cross-store, inventory or publication change' as result;
