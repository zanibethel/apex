-- CI ONLY, against disposable PostgreSQL. Never execute this test on hosted Supabase.
-- Seed a synthetic eligible but ZERO-STOCK private record; assert the released
-- feed stays empty until the independent global gate is deliberately enabled
-- in a transaction which is ALWAYS rolled back.
\set ON_ERROR_STOP on
\ir ../sql/apex_verified_only_sold_out_feed_REVIEW_ONLY.sql

do $check$
begin
 if not has_function_privilege('anon',
  'public.get_public_sold_out_catalog(integer,integer)','EXECUTE')
 then raise exception 'Anonymous public catalog feed not callable';end if;
 if has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
 then raise exception 'Internal authorization table leaked';end if;
 if public.get_public_sold_out_catalog() <> '[]'::jsonb
 then raise exception 'Catalog leaks when global gate is off';end if;
end $check$;

insert into public.products(store_id,category_id,sku,name,description,price_cents,currency,is_active)
values('20000000-0000-4000-8000-000000000003',
 '30000000-0000-4000-8000-000000000005',
 'APX-VERIFIED-SYNTHETIC','Synthetic approved catalog specimen',
 'Test-only placeholder with verified release evidence',2402,'USD',true);
update public.products set image_path=store_id::text||'/'||id::text||'/'||gen_random_uuid()::text||'.png'
where sku='APX-VERIFIED-SYNTHETIC';
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
select store_id,id,0,0 from public.products where sku='APX-VERIFIED-SYNTHETIC';
select id as tested_product from public.products where sku='APX-VERIFIED-SYNTHETIC' \gset
select set_config('apex.test.catalog_product',:'tested_product',false);

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('apex.test.catalog_product')::uuid,'publish');
reset role;

insert into apex_internal.supplier_release_authorizations(
 supplier_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
values ('10000000-0000-4000-8000-000000000002','verified',current_date+10,
 now(),'50000000-0000-4000-8000-000000000003','synthetic-evidence-seller')
on conflict(supplier_id) do update set
 status=excluded.status,valid_until=excluded.valid_until,
 reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,
 evidence_reference=excluded.evidence_reference;
insert into apex_internal.product_release_authorizations(
 store_id,product_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
values('20000000-0000-4000-8000-000000000003',
 current_setting('apex.test.catalog_product')::uuid,'verified',current_date+10,
 now(),'50000000-0000-4000-8000-000000000003','synthetic-evidence-item')
on conflict(store_id,product_id) do update set
 status=excluded.status,valid_until=excluded.valid_until,
 reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,
 evidence_reference=excluded.evidence_reference;

-- Drop the structural OFF-only check ONLY in a rolled-back synthetic test.
begin;
alter table apex_internal.private_release_gate
 drop constraint private_release_gate_enabled_check;
update apex_internal.private_release_gate set enabled=true where singleton=true;
set role anon;
do $test$
declare output jsonb;
begin
 output:=public.get_public_sold_out_catalog(0,24);
 if jsonb_array_length(output)<>1
 or output->0->>'name'<>'Synthetic approved catalog specimen'
 or output->0->>'availability'<>'sold_out'
 or output->0->>'can_checkout'<>'false'
 or output->0->>'price_cents'<>'2402'
 then raise exception 'Eligible zero-stock item did not render read-only';end if;
 if output->0 ? 'compare_at_price_cents'
 or output->0 ? 'internal_source_cost_cents'
 or output->0 ? 'image_path'
 or output->0 ? 'quantity_on_hand'
 then raise exception 'Private cost, inventory, images or compare-at leaked';end if;
 if public.get_public_sold_out_catalog(24,24)<>'[]'::jsonb
 then raise exception 'Catalog pagination failed';end if;
end $test$;
reset role;

-- An unverified source linkage immediately removes the item from the public feed.
insert into public.supplier_import_candidates(
 store_id,source_index,product_name,strength,wholesale_cost_cents,review_status)
values('20000000-0000-4000-8000-000000000003',1901,
 'Synthetic product source','5 MG',1201,'unverified');
insert into public.supplier_candidate_drafts(candidate_id,store_id,product_id,created_by)
select c.id,c.store_id,
 current_setting('apex.test.catalog_product')::uuid,
 '50000000-0000-4000-8000-000000000002'
 from public.supplier_import_candidates c
 where c.store_id='20000000-0000-4000-8000-000000000003' and source_index=1901;
set role anon;
do $test$
begin
 if public.get_public_sold_out_catalog()<>'[]'::jsonb
 then raise exception 'Unverified source became public';end if;
end $test$;
reset role;

update public.supplier_import_candidates set review_status='approved_for_draft'
 where store_id='20000000-0000-4000-8000-000000000003' and source_index=1901;
set role anon;
do $test$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>1
 then raise exception 'Verified source did not restore eligible read-only listing';end if;
end $test$;
reset role;

-- Admin lock immediately wins over supplier's existing publish preference.
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('apex.test.catalog_product')::uuid,
 'hold','Synthetic verification hold');
set role anon;
do $test$
begin
 if public.get_public_sold_out_catalog()<>'[]'::jsonb
 then raise exception 'Admin hold did not remove public feed listing';end if;
end $test$;
reset role;
rollback;

do $check$
begin
 if not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=false)
 then raise exception 'Test did not restore global structural OFF gate';end if;
 if public.get_public_sold_out_catalog()<>'[]'::jsonb
 then raise exception 'Catalog not empty after synthetic transaction rollback';end if;
end $check$;
\echo PASS: opt-in only, zero-stock sold out, source verification, admin hold, pagination, no private data, global gate re-locked.
