-- DISPOSABLE CI ONLY. Runs after simple_card_listing_controls_integration.sql.
\set ON_ERROR_STOP on
select id as correction_product from public.products
 where sku='APX-BETA-DRAFT-002' \gset
select set_config('request.test.correction_product', :'correction_product',false);

-- Privileged RPC is never anonymously invocable.
do $test$
begin
 if has_function_privilege('anon',
  'public.resubmit_supplier_listing_corrections(uuid,uuid,text)','EXECUTE')
 then raise exception 'Anon can submit supplier corrections'; end if;
end $test$;

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000099',false);
select set_config('request.jwt.claim.apex_role','',false);
do $test$
declare accepted boolean:=false;
begin
 begin
  perform public.resubmit_supplier_listing_corrections(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.correction_product')::uuid,
   'Unassigned account tried to resubmit');
  accepted:=true;
 exception when others then null; end;
 if accepted then raise exception 'Other tenant was able to submit corrections'; end if;
end $test$;

-- The assigned owner can submit one correction request but cannot unlock.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.resubmit_supplier_listing_corrections(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.correction_product')::uuid,
 'Updated the private offer image and details');
do $test$
declare accepted boolean:=false;
begin
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.correction_product')::uuid
   and admin_gate='review_required' and republish_approval_required
   and not supplier_wants_listing)
 then raise exception 'Supplier correction cleared admin hold'; end if;
 begin
  perform public.resubmit_supplier_listing_corrections(
   '20000000-0000-4000-8000-000000000003',
   current_setting('request.test.correction_product')::uuid,
   'Duplicate resubmit attempt');
  accepted:=true;
 exception when others then null;end;
 if accepted then raise exception 'Immediate duplicate correction was accepted';end if;
end $test$;

-- Admin can see the audit event, and only a separate admin decision clears hold.
reset role;
do $test$
begin
 if not exists(select 1 from public.supplier_listing_events
  where product_id=current_setting('request.test.correction_product')::uuid
    and action='supplier_corrections_resubmitted'
    and reason='Updated the private offer image and details')
 then raise exception 'Correction submission was not audited';end if;
 if exists(select 1 from public.products
    where id=current_setting('request.test.correction_product')::uuid and is_published)
    or exists(select 1 from public.stores
     where id='20000000-0000-4000-8000-000000000003' and is_public)
    or not exists(select 1 from apex_internal.private_release_gate
     where singleton=true and enabled=false)
 then raise exception 'Correction unexpectedly opened public release';end if;
end $test$;

-- The event note stays private: unrelated suppliers cannot read it.
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.apex_role','',false);
do $test$
begin
 if exists(select 1 from public.supplier_listing_events
  where product_id=current_setting('request.test.correction_product')::uuid
   and action='supplier_corrections_resubmitted')
 then raise exception 'Correction note leaked to an unrelated supplier';end if;
end $test$;

-- Verified platform admin can read the supplier note and independently unlock.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
do $test$
begin
 if not exists(select 1 from public.supplier_listing_events
  where product_id=current_setting('request.test.correction_product')::uuid
   and action='supplier_corrections_resubmitted'
   and reason='Updated the private offer image and details')
 then raise exception 'Admin could not see the correction explanation';end if;
end $test$;
select public.set_admin_listing_override(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.correction_product')::uuid,
 'approve_republish','Private corrections accepted after evidence review');
do $test$
begin
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.correction_product')::uuid
   and admin_gate='clear' and not republish_approval_required
   and republish_approved and not supplier_wants_listing)
 then raise exception 'Admin unlock was not independent of supplier publish intent';end if;
end $test$;

-- Supplier must deliberately request a new private listing; there are
-- still zero available units and no public storefront or checkout.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.set_supplier_listing_intent(
 '20000000-0000-4000-8000-000000000003',
 current_setting('request.test.correction_product')::uuid,'publish');
do $test$
begin
 if not exists(select 1 from public.supplier_listing_controls
  where product_id=current_setting('request.test.correction_product')::uuid
   and supplier_wants_listing and admin_gate='clear')
 then raise exception 'Supplier could not request listing after admin unlock';end if;
end $test$;

reset role;
do $test$
begin
 if not exists(select 1 from public.supplier_listing_events
  where product_id=current_setting('request.test.correction_product')::uuid
   and action='admin_republish_approved'
   and reason='Private corrections accepted after evidence review')
 or not exists(select 1 from public.supplier_listing_events
  where product_id=current_setting('request.test.correction_product')::uuid
   and action='publish_requested')
 then raise exception 'Correction review and supplier publication audit incomplete';end if;
 if exists(select 1 from public.products
    where id=current_setting('request.test.correction_product')::uuid
      and store_id='20000000-0000-4000-8000-000000000003' and is_published)
    or exists(select 1 from public.stores
     where id='20000000-0000-4000-8000-000000000003' and is_public)
    or not exists(select 1 from apex_internal.private_release_gate
     where singleton=true and enabled=false)
 then raise exception 'Resubmit, admin unlock, or supplier request enabled public release';end if;
end $test$;
\echo PASS: correction note isolated, admin reviews and unlocks, supplier opts in again, public gate remains off.

\echo PASS: private correction request recorded, wrong seller and anon denied, admin lock preserved.
