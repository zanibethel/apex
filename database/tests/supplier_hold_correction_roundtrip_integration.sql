-- CI-only full private listing lifecycle using synthetic roles and test products.
-- Run after private_release_decision_engine_integration.sql in disposable Postgres.
-- NEVER run on hosted Supabase or against real product/catalog data.
\set ON_ERROR_STOP on

select id as lifecycle_product from public.products
 where sku='APX-BETA-DRAFT-002' \gset
select set_config('request.test.lifecycle_product', :'lifecycle_product',false);

-- Admin applies a hold with a reason which the supplier should be able to read.
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.lifecycle_product')::uuid,
 'hold','QA: correct the private description');
do $check$
begin
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.lifecycle_product')::uuid
    and admin_gate='hold' and reason='QA: correct the private description'
    and republish_approval_required and not republish_approved
    and not supplier_wants_listing)
 then raise exception 'Admin hold or supplier-facing reason was not persisted';end if;
end $check$;

-- The assigned manager can read the hold reason, but editing their product
-- must not erase the admin hold or bypass the publication RPC.
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $check$
begin
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.lifecycle_product')::uuid
     and admin_gate='hold' and reason='QA: correct the private description')
 then raise exception 'Assigned supplier could not read current hold reason';end if;
end $check$;

update public.products
set description=description||' Supplier corrected description'
where store_id='20000000-0000-4000-8000-000000000003'
 and id=current_setting('request.test.lifecycle_product')::uuid;
do $check$
declare accepted boolean:=false;
begin
 if not exists(select 1 from public.products
   where id=current_setting('request.test.lifecycle_product')::uuid
     and description like '%Supplier corrected description')
 then raise exception 'Assigned supplier could not correct the private draft';end if;
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.lifecycle_product')::uuid
     and admin_gate='hold' and reason='QA: correct the private description')
 then raise exception 'Supplier content correction silently cleared admin hold';end if;
 begin
  perform public.set_supplier_listing_intent(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.lifecycle_product')::uuid,'publish');
  accepted:=true;
 exception when others then null;end;
 if accepted then raise exception 'Supplier bypassed hold after correcting a draft';end if;
end $check$;

-- A different supplier and a staff user cannot read or override the hold.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $check$
begin
 if exists(select 1 from public.supplier_listing_controls
    where product_id=current_setting('request.test.lifecycle_product')::uuid)
 then raise exception 'Cross-supplier hold reason leaked';end if;
end $check$;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
do $check$
begin
 if exists(select 1 from public.supplier_listing_controls
    where product_id=current_setting('request.test.lifecycle_product')::uuid)
 then raise exception 'Staff read a supplier hold reason';end if;
end $check$;

-- Admin changes the action and reason; supplier must see the latest note only.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.lifecycle_product')::uuid,
 'require_review','QA: confirm corrected description');
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $check$
declare accepted boolean:=false;
begin
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.lifecycle_product')::uuid
    and admin_gate='review_required'
    and reason='QA: confirm corrected description'
    and republish_approval_required and not republish_approved)
 then raise exception 'Supplier did not see latest required-review feedback';end if;
 begin
  perform public.set_supplier_listing_intent(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.lifecycle_product')::uuid,'publish');
  accepted:=true;
 exception when others then null;end;
 if accepted then raise exception 'Supplier bypassed required review before approval';end if;
end $check$;

-- Admin approval clears only the hold: it cannot silently re-submit a request.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.lifecycle_product')::uuid,
 'approve_republish','QA: private correction accepted');
do $check$
begin
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.lifecycle_product')::uuid
    and admin_gate='clear' and republish_approved
    and not republish_approval_required and not supplier_wants_listing)
 then raise exception 'Admin approval incorrectly resubmitted supplier preference';end if;
end $check$;

select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.lifecycle_product')::uuid,'publish');
do $check$
declare v_decision jsonb;
begin
 if not exists(select 1 from public.supplier_listing_controls
   where product_id=current_setting('request.test.lifecycle_product')::uuid
    and supplier_wants_listing and admin_gate='clear')
 then raise exception 'Corrected product could not be privately requested after admin approval';end if;
 v_decision:=public.get_private_release_readiness(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.lifecycle_product')::uuid);
 if v_decision->>'effective_public'<>'false'
 then raise exception 'Private correction workflow activated public release';end if;
end $check$;

reset role;
do $check$
begin
 if exists(select 1 from public.products
  where id=current_setting('request.test.lifecycle_product')::uuid and is_published)
 or exists(select 1 from public.stores
  where id='20000000-0000-4000-8000-000000000003' and is_public)
 then raise exception 'Admin/supplier correction workflow mutated public visibility';end if;
 if (select count(*) from public.supplier_listing_events
   where product_id=current_setting('request.test.lifecycle_product')::uuid
     and action='admin_hold' and reason='QA: correct the private description')<>1
 or (select count(*) from public.supplier_listing_events
   where product_id=current_setting('request.test.lifecycle_product')::uuid
     and action='admin_review_required' and reason='QA: confirm corrected description')<>1
 or (select count(*) from public.supplier_listing_events
   where product_id=current_setting('request.test.lifecycle_product')::uuid
     and action='admin_republish_approved' and reason='QA: private correction accepted')<>1
 then raise exception 'Admin review feedback audit history incomplete';end if;
end $check$;
\echo PASS: synthetic admin hold, supplier correction, role scoping, review, approval and private re-request.
