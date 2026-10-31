-- CI-only synthetic database. Execute after supplier_listing_admin_override_integration.
-- Never run against any hosted Supabase database.
\set ON_ERROR_STOP on
\ir ../sql/apex_private_release_decision_engine_REVIEW_ONLY.sql

do $guard$
begin
 if (select count(*) from apex_internal.listing_identity_holds where active)<>1
 then raise exception 'Did not backfill existing review hold signature';end if;
 if (select count(*) from apex_internal.private_release_gate where enabled)<>0
 or has_function_privilege('anon','public.get_private_release_readiness(uuid,uuid)','EXECUTE')
 or has_table_privilege('authenticated','apex_internal.supplier_release_authorizations','UPDATE')
 or has_table_privilege('authenticated','apex_internal.product_release_authorizations','UPDATE')
 then raise exception 'Private release gate or eligibility permissions unsafe';end if;
end $guard$;

select id as original_product from public.products where sku='APX-BETA-DRAFT-002' \gset
select set_config('request.test.release_product', :'original_product',false);

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.apex_role','',false);
do $guard$
declare denied boolean:=false;
begin
 begin
  perform public.get_private_release_readiness(
    '20000000-0000-4000-8000-000000000003',
    current_setting('request.test.release_product')::uuid);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Unrelated supplier read private release eligibility';end if;
end $guard$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
do $guard$
declare result jsonb;
begin
 result:=public.get_private_release_readiness(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.release_product')::uuid);
 if result->>'status_code'<>'admin_review_required'
 or result->>'effective_public'<>'false'
 then raise exception 'Admin review gate did not take priority';end if;
end $guard$;
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.release_product')::uuid,
 'approve_republish','Release this specific product for private requests');

reset role;
-- An exact-title clone with a different SKU is still held by identity.
insert into public.products(
 store_id,category_id,sku,name,description,price_cents,currency,
 is_active,image_path,is_published
)
select p.store_id,p.category_id,'DUPLICATE-NEW-SKU',p.name,p.description,
 p.price_cents,p.currency,p.is_active,p.image_path,false
from public.products p where p.id=current_setting('request.test.release_product')::uuid;
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
select p.store_id,p.id,4,0 from public.products p where p.sku='DUPLICATE-NEW-SKU';
select id as duplicate_product from public.products where sku='DUPLICATE-NEW-SKU' \gset
select set_config('request.test.duplicate_product', :'duplicate_product',false);

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.duplicate_product')::uuid,'publish');
do $guard$
declare result jsonb;
begin
 result:=public.get_private_release_readiness(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.duplicate_product')::uuid);
 if result->>'status_code'<>'supplier_authorization_unverified'
 then raise exception 'Missing supplier authorization was not fail-closed';end if;
end $guard$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.release_product')::uuid,
 'hold','Hold exact product identity across cloned SKUs');
do $guard$
begin
 if (select count(*) from public.supplier_listing_controls
 where product_id=current_setting('request.test.duplicate_product')::uuid
  and supplier_wants_listing)<>0
 then raise exception 'Admin hold did not clear duplicate publication preference';end if;
end $guard$;

select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $guard$
declare denied boolean:=false;result jsonb;
begin
 result:=public.get_private_release_readiness(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.duplicate_product')::uuid);
 if result->>'status_code'<>'same_supplier_identity_hold'
 then raise exception 'Cloned same-name listing was not blocked';end if;
 begin
  perform public.set_supplier_listing_intent(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.duplicate_product')::uuid,'publish');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Cloned listing bypassed held identity';end if;
end $guard$;

-- Expiring or blocked authorizations must supersede the public disabled gate.
reset role;
insert into apex_internal.supplier_release_authorizations(
 supplier_id,status,valid_until)
 values('10000000-0000-4000-8000-000000000002','verified',current_date+30);
insert into apex_internal.product_release_authorizations(
 store_id,product_id,status,valid_until)
 values(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.duplicate_product')::uuid,
 'verified',current_date+30);

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.release_product')::uuid,
 'approve_republish','Release held product identity');
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $guard$
declare result jsonb;
begin
 result:=public.get_private_release_readiness(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.duplicate_product')::uuid);
 if result->>'status_code'<>'supplier_not_requested'
 then raise exception 'Admin release automatically restored duplicate preference';end if;
end $guard$;

select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.duplicate_product')::uuid,'publish');
do $guard$
declare result jsonb;
begin
 result:=public.get_private_release_readiness(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.duplicate_product')::uuid);
 if result->>'status_code'<>'public_release_disabled'
 or result->>'effective_public'<>'false'
 or result->'checks'->>'supplier_authorized'<>'true'
 or result->'checks'->>'product_authorized'<>'true'
 or result->'checks'->>'public_release_enabled'<>'false'
 then raise exception 'Fully qualified private request must remain unreleased';end if;
end $guard$;

reset role;
update apex_internal.product_release_authorizations
 set valid_until=current_date-1
 where product_id=current_setting('request.test.duplicate_product')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $guard$
begin
 if public.get_private_release_readiness(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.duplicate_product')::uuid)->>'status_code'
   <>'product_authorization_unverified'
 then raise exception 'Expired product authorization not blocked';end if;
end $guard$;

reset role;
update apex_internal.product_release_authorizations
 set status='blocked',valid_until=current_date+30
 where product_id=current_setting('request.test.duplicate_product')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $guard$
begin
 if public.get_private_release_readiness(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.duplicate_product')::uuid)->>'status_code'
   <>'product_authorization_blocked'
 then raise exception 'Explicitly blocked product authorization ignored';end if;
end $guard$;

reset role;
do $guard$
begin
 if exists(
  select 1 from public.products p
  join public.supplier_listing_controls c
   on p.store_id=c.store_id and p.id=c.product_id
  where p.is_published
 ) or exists(
  select 1 from public.stores
  where id='20000000-0000-4000-8000-000000000003'
   and is_public
 ) then raise exception 'Private decision engine published a product/store';end if;
end $guard$;
\echo PASS: private decision is fail-closed, tenant-scoped, and duplicate holds block clone requests.
