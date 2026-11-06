-- Test ONLY in disposable apex_test after initial catalog migration and private staging migration.
\set ON_ERROR_STOP on
begin;
insert into public.suppliers(id,slug,display_name) values
 ('a1000000-0000-4000-8000-000000000001','variant-fixture-a','Fixture A'),
 ('a1000000-0000-4000-8000-000000000002','variant-fixture-b','Fixture B');
insert into public.stores(id,supplier_id,slug,display_name,is_public) values
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','variant-fixture-a','A',false),
 ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','variant-fixture-b','B',false);
insert into public.supplier_memberships(supplier_id,user_id,role) values
 ('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('a1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000002','staff'),
 ('a1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000003','manager');
insert into public.apex_supplier_variant_review_items(store_id,source_batch,source_row,parent_title,source_name,source_section,strength,size,carrier_oil,retail_price_cents,review_status) values
 ('b1000000-0000-4000-8000-000000000001','synthetic-v1',4,'Sample Parent','Sample','Synthetic','100 mg','10 mL','MCT',1200,'pending_review'),
 ('b1000000-0000-4000-8000-000000000001','synthetic-v1',4,'Sample Parent','Sample','Synthetic','100 mg','10 mL','GSO',1300,'pending_review'),
 ('b1000000-0000-4000-8000-000000000002','synthetic-v1',5,'Other Store','Sample','Synthetic','','10 mL','',null,'needs_clarification');

do $check$
begin
 if has_table_privilege('anon','public.apex_supplier_variant_review_items','SELECT')
 or has_table_privilege('authenticated','public.apex_supplier_variant_review_items','INSERT')
 or has_table_privilege('authenticated','public.apex_supplier_variant_review_items','UPDATE')
 or has_table_privilege('authenticated','public.apex_supplier_variant_review_items','DELETE')
 then raise exception 'Private staging privileges are too broad';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.apex_supplier_variant_review_items'::regclass)
 then raise exception 'Private staging RLS must be forced';end if;
end $check$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $owner$
begin
 if (select count(*) from public.apex_supplier_variant_review_items)<>2
 then raise exception 'Owner must only see own two entries';end if;
 if (select count(*) from public.apex_supplier_variant_review_items where retail_price_cents=1200)<>1
 then raise exception 'Retail price did not survive';end if;
end $owner$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $staff$
begin
 if exists(select 1 from public.apex_supplier_variant_review_items)
 then raise exception 'Staff must be denied';end if;
end $staff$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $manager$
begin
 if (select count(*) from public.apex_supplier_variant_review_items)<>1
 then raise exception 'Manager must only see own store';end if;
 if exists(select 1 from public.apex_supplier_variant_review_items where retail_price_cents=1200)
 then raise exception 'Cross-store data leaked';end if;
end $manager$;
reset role;

do $duplicate$
begin
 begin
  insert into public.apex_supplier_variant_review_items(store_id,source_batch,source_row,parent_title,source_name,source_section,strength,size,carrier_oil,retail_price_cents,review_status)
  values('b1000000-0000-4000-8000-000000000001','synthetic-v1',4,'Sample Parent','Sample','Synthetic','100 mg','10 mL','MCT',9999,'pending_review');
  raise exception 'Duplicate was accepted';
 exception when unique_violation then null;end;
 begin
  insert into public.apex_supplier_variant_review_items(store_id,source_batch,source_row,parent_title,source_name,source_section,retail_price_cents,review_status)
  values('b1000000-0000-4000-8000-000000000001','synthetic-v1',6,'Blocked','Sample','Synthetic',null,'pending_review');
  raise exception 'Missing retail price was accepted';
 exception when check_violation then null;end;
end $duplicate$;

rollback;
select 'PASS: private variant read, owner/manager tenant scope, staff/anon/write denial, duplicate and price validation';
