-- Disposable CI only: validates product draft fields and supplier promo row isolation.
\set ON_ERROR_STOP on
\ir ../sql/apex_product_media_promos_review.sql

DO $assert$
BEGIN
 if has_column_privilege('authenticated','public.products','is_published','UPDATE')
    or has_column_privilege('authenticated','public.products','store_id','UPDATE')
    or has_column_privilege('authenticated','public.supplier_discount_codes','redemption_count','UPDATE')
    or has_column_privilege('authenticated','public.supplier_discount_codes','store_id','UPDATE')
    or has_table_privilege('anon','public.supplier_discount_codes','SELECT')
 then raise exception 'Unsafe product or promo grant'; end if;
end $assert$;

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
update public.products
 set is_active=true,description='Preview only',price_cents=2000,compare_at_price_cents=2500
 where sku='B-NEW-DRAFT';
do $assert$
begin
 if not exists(select 1 from public.products where sku='B-NEW-DRAFT'
    and is_active=true and compare_at_price_cents=2500)
 then raise exception 'Draft metadata update failed'; end if;
end $assert$;

do $assert$
declare succeeded boolean:=false;
begin
 begin
  update public.products set compare_at_price_cents=1999 where sku='B-NEW-DRAFT';
  succeeded:=true;
 exception when check_violation then null; end;
 if succeeded then raise exception 'Invalid compare-at discount accepted'; end if;
end $assert$;

insert into public.supplier_discount_codes
 (store_id,code,discount_kind,discount_value,min_subtotal_cents,is_active,created_by)
values
 ('20000000-0000-4000-8000-000000000003','PREVIEW10','percentage',10,5000,false,
  '50000000-0000-4000-8000-000000000002');
update public.supplier_discount_codes set is_active=true
 where code='PREVIEW10' and store_id='20000000-0000-4000-8000-000000000003';
do $assert$
begin
 if (select count(*) from public.supplier_discount_audit) <> 2 then
  raise exception 'Promo audit missed create/update'; end if;
 if not exists(select 1 from public.supplier_discount_codes
   where code='PREVIEW10' and discount_value=10 and is_active)
 then raise exception 'Promo not managed'; end if;
end $assert$;

-- User Alpha cannot create a discount in Beta's private store.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $assert$
declare succeeded boolean:=false;
begin
 begin
  insert into public.supplier_discount_codes
  (store_id,code,discount_kind,discount_value,created_by)
  values ('20000000-0000-4000-8000-000000000003','CROSSSTORE','fixed',300,
    '50000000-0000-4000-8000-000000000001');
  succeeded:=true;
 exception when insufficient_privilege then null; end;
 if succeeded then raise exception 'Cross-supplier discount created'; end if;
 if (select count(*) from public.supplier_discount_codes)<>0
 then raise exception 'Cross-supplier promo leak'; end if;
end $assert$;

-- An unaffiliated account sees no supplier promotions.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
do $assert$
begin
 if (select count(*) from public.supplier_discount_codes)<>0 then
  raise exception 'Unaffiliated discount visibility leak'; end if;
end $assert$;
reset role;
\echo PASS: private products, compare-at prices, coupon RLS and audit.
