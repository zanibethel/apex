-- DISPOSABLE CI ONLY. Runs after previous synthetic supplier hold lifecycle,
-- before private product batch persistence tests.
\set ON_ERROR_STOP on
select id as simple_product from public.products
 where sku='APX-BETA-DRAFT-002' \gset
select set_config('request.test.simple_product', :'simple_product',false);
update public.inventory_items set quantity_on_hand=0,quantity_reserved=0
 where store_id='20000000-0000-4000-8000-000000000003'
   and product_id=current_setting('request.test.simple_product')::uuid;

-- The existing private snapshot now accepts a zero-stock product.
do $test$
declare v jsonb;
begin
 v:=apex_internal.private_product_review_snapshot(
  '20000000-0000-4000-8000-000000000003',
  current_setting('request.test.simple_product')::uuid);
 if v is null or (v->>'quantity_on_hand')::integer<>0
  or (v->>'quantity_reserved')::integer<>0
 then raise exception 'Zero-stock internal draft snapshot was rejected';end if;
end $test$;

-- Supplier can request a Sold Out listing without a separate OWNER approval
-- when no administrative lock exists. This is NOT public sale permission.
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.simple_product')::uuid,'publish');
do $test$
begin
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.simple_product')::uuid
     and supplier_wants_listing and admin_gate='clear')
 then raise exception 'Supplier could not request zero-stock listing';end if;
end $test$;

-- Owner unpublishes without locking or requiring admin reapproval.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.simple_product')::uuid,'unpublish','Owner removed from storefront');
do $test$
begin
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.simple_product')::uuid
     and not supplier_wants_listing and admin_gate='clear'
     and not republish_approval_required
     and reason='Owner removed from storefront')
 then raise exception 'Owner unpublish imposed an accidental lock';end if;
end $test$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.simple_product')::uuid,'publish');

-- Owner can lock with a reason. Supplier cannot override it.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.simple_product')::uuid,'require_review','Correct image identity before republishing');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
do $test$
declare accepted boolean:=false;
begin
 begin
  perform public.set_supplier_listing_intent(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.simple_product')::uuid,'publish');
  accepted:=true;
 exception when others then null;end;
 if accepted then raise exception 'Supplier bypassed owner lock';end if;
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.simple_product')::uuid
    and admin_gate='review_required' and not supplier_wants_listing
    and reason='Correct image identity before republishing')
 then raise exception 'Supplier cannot see lock or correction reason';end if;
end $test$;
reset role;
do $test$
begin
 if not exists(select 1 from public.supplier_listing_events
   where product_id=current_setting('request.test.simple_product')::uuid
     and action='admin_unpublish' and reason='Owner removed from storefront')
 then raise exception 'Owner unpublish audit event missing';end if;
 if exists(select 1 from public.products
    where id=current_setting('request.test.simple_product')::uuid and is_published)
    or exists(select 1 from public.stores
     where id='20000000-0000-4000-8000-000000000003' and is_public)
    or not exists(select 1 from apex_internal.private_release_gate
     where singleton=true and enabled=false)
 then raise exception 'Private switch incorrectly enabled public release';end if;
end $test$;
\echo PASS: zero-stock supplier intent, owner plain unpublish, reasoned lock, audit and no public release.
