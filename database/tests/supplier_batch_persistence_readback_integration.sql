-- CI-only readback in a NEW psql process/connection, after the separate
-- supplier_batch_persistence_seed_integration.sql has committed.
-- No previous frontend/psql session state is reused. Never run hosted.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);

do $assert$
begin
 if (select count(*) from public.products
  where store_id='20000000-0000-4000-8000-000000000003'
  and sku like 'APX-QA-SAVED-%')<>25
 then raise exception 'Fresh connection did not read back all 25 supplier drafts';end if;

 if exists (
  select 1 from generate_series(1,25) as numbers(n)
  left join public.products p
   on p.store_id='20000000-0000-4000-8000-000000000003'
   and p.sku='APX-QA-SAVED-'||lpad(numbers.n::text,2,'0')
  left join public.inventory_items i
   on i.store_id=p.store_id and i.product_id=p.id
  where p.id is null
   or p.name is distinct from 'Saved synthetic product '||lpad(numbers.n::text,2,'0')
   or p.description is distinct from 'Persisted edited description '||lpad(numbers.n::text,2,'0')
   or p.category_id is distinct from '30000000-0000-4000-8000-000000000005'::uuid
   or p.price_cents is distinct from 3500+numbers.n
   or p.compare_at_price_cents is distinct from 4500+numbers.n
   or p.internal_source_cost_cents is distinct from 800+numbers.n
   or p.is_active is distinct from true
   or p.is_published is distinct from false
   or i.quantity_on_hand is distinct from 15+numbers.n
   or i.quantity_reserved is distinct from 0
 ) then raise exception 'Product edit or inventory field lost across fresh connection';end if;
end $assert$;

-- Changing identity in the fresh connection must never expose these drafts.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $assert$
begin
 if exists (select 1 from public.products where sku like 'APX-QA-SAVED-%')
 or exists (
  select 1 from public.inventory_items
   where store_id='20000000-0000-4000-8000-000000000003'
 ) then raise exception 'Cross-supplier private batch leaked';end if;
end $assert$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
do $assert$
begin
 if (select count(*) from public.products where sku like 'APX-QA-SAVED-%')<>25
 then raise exception 'Existing same-supplier staff read permission unexpectedly changed';end if;
 -- Staff may read its supplier inventory; staff MUST NOT gain private edits.
 if has_column_privilege('authenticated','public.products','is_published','UPDATE')
 then raise exception 'Private products gained publication-write privileges';end if;
end $assert$;

reset role;
set role anon;
do $assert$
begin
 if exists (select 1 from public.products where sku like 'APX-QA-SAVED-%')
 then raise exception 'Anonymous user read private batch';end if;
end $assert$;
reset role;
\echo PASS: separate connection confirms 25 persisted supplier product edits, stock and tenant boundaries.
