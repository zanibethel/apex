-- CI-only, after the synthetic review-integrity fixture. Never run live.
\set ON_ERROR_STOP on
\ir ../sql/apex_supplier_publish_admin_override_REVIEW_ONLY.sql

do $guard$
begin
 if has_table_privilege('authenticated','public.supplier_listing_controls','INSERT')
 or has_table_privilege('authenticated','public.supplier_listing_controls','UPDATE')
 or has_table_privilege('authenticated','public.supplier_listing_events','INSERT')
 or has_table_privilege('anon','public.supplier_listing_controls','SELECT')
 or not (select relrowsecurity from pg_class where oid='public.supplier_listing_controls'::regclass)
 or not (select relrowsecurity from pg_class where oid='public.supplier_listing_events'::regclass)
 then raise exception 'Listing controls exposed direct mutations or anon reads';end if;
end $guard$;

-- CI fixture has a complete private product whose SKU was edited in previous
-- review-integrity tests to APX-BETA-DRAFT-002.
set role authenticated;
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $guard$
declare ok boolean:=false;
begin
 begin
  perform public.set_supplier_listing_intent(
    '20000000-0000-4000-8000-000000000003',
    (select id from public.products where sku='APX-BETA-DRAFT-002'),
    'publish');
  ok:=true;
 exception when others then null;end;
 if ok then raise exception 'Cross supplier publish request accepted';end if;
end $guard$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'),'publish');
do $guard$
begin
 if (select count(*) from public.supplier_listing_controls
     where supplier_wants_listing and admin_gate='clear')<>1
 or (select count(*) from public.supplier_listing_events
     where action='publish_requested')<>1
 then raise exception 'Owner/manager publish intent not recorded';end if;
end $guard$;

-- Admin JWT claim cannot be forged by a normal supplier user.
do $guard$
declare ok boolean:=false;
begin
 begin
  perform public.set_admin_listing_override(
    '20000000-0000-4000-8000-000000000003',
    (select id from public.products where sku='APX-BETA-DRAFT-002'),
    'hold','should fail');
  ok:=true;
 exception when others then null;end;
 if ok then raise exception 'Supplier created an admin hold';end if;
end $guard$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'),
 'hold','Internal hold for verification');
do $guard$
begin
 if (select count(*) from public.supplier_listing_controls where
  admin_gate='hold' and republish_approval_required
  and not republish_approved and not supplier_wants_listing)<>1
 then raise exception 'Admin hold not enforced';end if;
end $guard$;

select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $guard$
declare ok boolean:=false;
begin
 begin
  perform public.set_supplier_listing_intent(
    '20000000-0000-4000-8000-000000000003',
    (select id from public.products where sku='APX-BETA-DRAFT-002'),'publish');
  ok:=true;
 exception when others then null;end;
 if ok then raise exception 'Supplier bypassed admin hold';end if;
end $guard$;

-- Staff cannot see/edit owner-only listing controls.
reset role;
insert into auth.users(id) values ('50000000-0000-4000-8000-000000000004');
insert into public.supplier_memberships(supplier_id,user_id,role)
 values('10000000-0000-4000-8000-000000000002',
        '50000000-0000-4000-8000-000000000004','staff');
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
do $guard$
declare ok boolean:=false;
begin
 if exists(select 1 from public.supplier_listing_controls)
 then raise exception 'Staff read restricted listing controls';end if;
 begin
  perform public.set_supplier_listing_intent(
   '20000000-0000-4000-8000-000000000003',
   (select id from public.products where sku='APX-BETA-DRAFT-002'),
   'publish');
  ok:=true;
 exception when others then null;end;
 if ok then raise exception 'Staff requested listing';end if;
end $guard$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'),
 'approve_republish','Approved for supplier to re-request');
do $guard$
begin
 if (select count(*) from public.supplier_listing_controls where
 admin_gate='clear' and republish_approved and not republish_approval_required
 and not supplier_wants_listing)<>1
 then raise exception 'Admin reapproval incorrectly published automatically';end if;
end $guard$;

select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'),'publish');

select set_config('request.jwt.claim.apex_role','platform_admin',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'),
 'require_review','Review updated labeling');
do $guard$
begin
 if (select count(*) from public.supplier_listing_controls
 where admin_gate='review_required' and republish_approval_required
 and not supplier_wants_listing)<>1
 then raise exception 'Admin review gate was not enforced';end if;
 if (select count(*) from public.supplier_listing_events)<>5
 then raise exception 'Listing audit is missing events';end if;
end $guard$;


-- Re-approve the current private draft and verify that routine price / inventory
-- updates NO LONGER trigger a duplicate mandatory review.
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.submit_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-002'));
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select product_id from public.private_product_review_states limit 1),
 (select submission_id from public.private_product_review_states limit 1),
 'approved_internal','Internally reviewed');
reset role;
update public.products set price_cents=price_cents+100
 where sku='APX-BETA-DRAFT-002';
update public.inventory_items set quantity_on_hand=quantity_on_hand+1
 where store_id='20000000-0000-4000-8000-000000000003'
 and product_id=(select id from public.products where sku='APX-BETA-DRAFT-002');
do $guard$
begin
 if (select status from public.private_product_review_states limit 1)<>'approved_internal'
 then raise exception 'Routine price/stock edits unnecessarily invalidate review';end if;
end $guard$;
update public.products set description=description||' New labeling details'
 where sku='APX-BETA-DRAFT-002';
do $guard$
begin
 if (select status from public.private_product_review_states limit 1)<>'changes_requested'
 then raise exception 'Material description edit failed to invalidate approval';end if;
end $guard$;

-- No public product/category/store flags changed by any action.
reset role;
do $guard$
begin
 if exists(select 1 from public.products p
    join public.supplier_listing_controls c
      on c.store_id=p.store_id and c.product_id=p.id
    where p.is_published)
 or exists(select 1 from public.stores
    where id='20000000-0000-4000-8000-000000000003' and is_public)
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 then raise exception 'Private supplier publishing changed public visibility';end if;
end $guard$;
\echo PASS: supplier preference, staff denial, admin hold/review/reapproval and no public visibility.
