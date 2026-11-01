-- Disposable PostgreSQL only, after the existing Apex CI fixtures.
-- A synthetic authenticated supplier manager saves 25 private draft records
-- and edits all product fields, then ends the transaction/session.
-- NEVER run this against hosted Supabase or real supplier data.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
begin;
insert into public.products
 (store_id,category_id,sku,name,description,price_cents,currency)
select '20000000-0000-4000-8000-000000000003'::uuid,
 '30000000-0000-4000-8000-000000000005'::uuid,
 'APX-QA-PERSIST-'||lpad(n::text,2,'0'),
 'Synthetic initial '||lpad(n::text,2,'0'),
 'Before edit '||lpad(n::text,2,'0'),2500+n,'USD'
from generate_series(1,25) as n;

insert into public.inventory_items(store_id,product_id,quantity_on_hand)
select p.store_id,p.id,0 from public.products p
where p.store_id='20000000-0000-4000-8000-000000000003'
 and p.sku like 'APX-QA-PERSIST-%';

update public.products set
 sku='APX-QA-SAVED-'||right(sku,2),
 name='Saved synthetic product '||right(sku,2),
 description='Persisted edited description '||right(sku,2),
 price_cents=3500+right(sku,2)::integer,
 compare_at_price_cents=4500+right(sku,2)::integer,
 internal_source_cost_cents=800+right(sku,2)::integer,
 is_active=true
where store_id='20000000-0000-4000-8000-000000000003'
 and sku like 'APX-QA-PERSIST-%';

update public.inventory_items i
set quantity_on_hand=15+right(p.sku,2)::integer
from public.products p
where i.store_id=p.store_id and i.product_id=p.id
 and p.store_id='20000000-0000-4000-8000-000000000003'
 and p.sku like 'APX-QA-SAVED-%';

do $assert$
begin
 if (select count(*) from public.products
     where store_id='20000000-0000-4000-8000-000000000003'
      and sku like 'APX-QA-SAVED-%')<>25
 then raise exception 'Supplier batch did not save exactly 25 private products';end if;
 if exists (select 1 from public.products
     where sku like 'APX-QA-SAVED-%' and is_published)
 then raise exception 'Synthetic supplier batch exposed public products';end if;
end $assert$;
commit;
reset role;
\echo PASS: synthetic supplier saved 25 private products and committed.
