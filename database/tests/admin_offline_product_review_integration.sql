-- Disposable PostgreSQL integration for administrator-recorded, off-platform reviews.
-- NEVER execute this fixture against production. All synthetic rows roll back.
\set ON_ERROR_STOP on
begin;
insert into public.products (
 id,store_id,category_id,sku,name,description,price_cents,is_published,is_active
) values (
 'f4000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000003',
 '30000000-0000-4000-8000-000000000005',
 'OFFLINE-REVIEW-001','Synthetic retail package','Noncommerce review fixture',
 2500,false,true
);
do $assert$
begin
 if has_table_privilege('anon','apex_internal.admin_offline_product_reviews','SELECT')
 or has_table_privilege('authenticated','apex_internal.admin_offline_product_reviews','INSERT')
 or has_table_privilege('authenticated','apex_internal.admin_offline_product_review_events','SELECT')
 then raise exception 'Offline review private data grants are not isolated';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class
  where oid='apex_internal.admin_offline_product_reviews'::regclass)
 then raise exception 'Offline review RLS / FORCE missing';end if;
end $assert$;
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claims','{}',false);
do $assert$
begin
 begin
  perform public.get_admin_offline_product_reviews();
  raise exception 'Supplier read access was allowed';
 exception when others then
  if SQLERRM='Supplier read access was allowed' then raise;end if;
 end;
 begin
  perform public.set_admin_offline_product_review(
    '20000000-0000-4000-8000-000000000003',
    'f4000000-0000-4000-8000-000000000001',
    'approved','OFFLINE-001','Synthetic',null);
  raise exception 'Supplier write access was allowed';
 exception when others then
  if SQLERRM='Supplier write access was allowed' then raise;end if;
 end;
end $assert$;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',false);
do $assert$
declare v_rows jsonb;
begin
 perform public.set_admin_offline_product_review(
  '20000000-0000-4000-8000-000000000003',
  'f4000000-0000-4000-8000-000000000001',
  'approved','OFFLINE-001','Synthetic fixture; no legal approval', '2030-01-01');
 v_rows:=public.get_admin_offline_product_reviews();
 if not exists(select 1 from jsonb_array_elements(v_rows) r
   where r->>'product_id'='f4000000-0000-4000-8000-000000000001'
    and r->>'status'='approved' and r->>'current_product'='true'
    and r->>'expired'='false')
 then raise exception 'Admin review not readable or was stale';end if;
 begin
  perform public.set_admin_offline_product_review(
   '20000000-0000-4000-8000-000000000003',
   'f4000000-0000-4000-8000-000000000001',
   'approved','','',null);
  raise exception 'Approval without evidence was accepted';
 exception when others then
  if SQLERRM='Approval without evidence was accepted' then raise;end if;
 end;
end $assert$;
reset role;
update public.products set description='Changed after external review'
 where id='f4000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',false);
do $assert$
declare v_rows jsonb;
begin
 v_rows:=public.get_admin_offline_product_reviews();
 if not exists(select 1 from jsonb_array_elements(v_rows) r
   where r->>'product_id'='f4000000-0000-4000-8000-000000000001'
    and r->>'current_product'='false')
 then raise exception 'Changed product was not marked stale';end if;
 perform public.set_admin_offline_product_review(
  '20000000-0000-4000-8000-000000000003',
  'f4000000-0000-4000-8000-000000000001',
  'revoked','','Synthetic record revoked',null);
end $assert$;
reset role;
do $assert$
begin
 if (select count(*) from apex_internal.admin_offline_product_review_events
  where product_id='f4000000-0000-4000-8000-000000000001')<>2
 then raise exception 'Offline review audit history did not retain both events';end if;
 if (select is_published from public.products
  where id='f4000000-0000-4000-8000-000000000001') is distinct from false
 then raise exception 'Offline approval unexpectedly published product';end if;
end $assert$;
rollback;
\echo PASS: off-platform review roles, evidence, freshness, audit, and no product release.
