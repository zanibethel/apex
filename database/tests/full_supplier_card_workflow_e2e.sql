-- CI ONLY — synthetic, atomic supplier -> administrator workflow.
-- Requires all existing schemas and migrations. Never run against hosted Apex.
-- Every product, source, image-path placeholder, audit row, and authorization
-- created here is ROLLED BACK. No real images or order transactions are made.
\set ON_ERROR_STOP on
begin;

insert into public.supplier_import_candidates(
 store_id,source_index,product_name,strength,wholesale_cost_cents,review_status
) values (
 '20000000-0000-4000-8000-000000000003',2997,
 'Synthetic Workflow Fixture','5 UNIT',1250,'unverified'
);
select id as fixture_candidate from public.supplier_import_candidates
 where source_index=2997 and store_id='20000000-0000-4000-8000-000000000003' \gset
select set_config('apex.e2e.candidate',:'fixture_candidate',false);
select set_config('apex.e2e.store','20000000-0000-4000-8000-000000000003',false);

-- Supplier creates an editable, source-linked private zero-stock product.
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
select public.create_private_draft_from_source(
 current_setting('apex.e2e.store')::uuid,
 current_setting('apex.e2e.candidate')::uuid,
 'SYNTHETIC-E2E-2997','Synthetic placeholder for private workflow only',1250
) as fixture_product \gset
select set_config('apex.e2e.product',:'fixture_product',false);

do $assert$
begin
 if not exists (
  select 1 from public.products p
  join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
  join public.supplier_candidate_drafts d on d.product_id=p.id
  where p.id=current_setting('apex.e2e.product')::uuid
   and p.price_cents=2500 and p.compare_at_price_cents=3125
   and p.internal_source_cost_cents=1250 and p.is_active=false
   and p.is_published=false and i.quantity_on_hand=0 and i.quantity_reserved=0
   and d.candidate_id=current_setting('apex.e2e.candidate')::uuid
 ) then raise exception 'E2E: source did not produce a real private zero-stock card';end if;
end $assert$;

-- Supplier completes editable metadata and links a synthetic private image
-- path (no storage object or real image is uploaded by this database test).
update public.products p set
 category_id='30000000-0000-4000-8000-000000000005',
 description='Synthetic private test product with current identity details',
 price_cents=2999,is_active=true,
 image_path=p.store_id::text||'/'||p.id::text||'/00000000-0000-4000-8000-000000000073.png'
where p.id=current_setting('apex.e2e.product')::uuid and p.is_published=false;
do $assert$
begin
 if (select count(*) from public.products
    where id=current_setting('apex.e2e.product')::uuid
    and image_path is not null and is_active and price_cents=2999)<>1
 then raise exception 'E2E: supplier card metadata edits did not persist';end if;
end $assert$;
select public.set_supplier_listing_intent(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 'publish');
do $assert$
declare v jsonb;
begin
 v:=public.get_private_release_readiness(
   current_setting('apex.e2e.store')::uuid,
   current_setting('apex.e2e.product')::uuid);
 if v->>'effective_public'='true' then raise exception 'E2E: unverified source became public';end if;
end $assert$;
select public.submit_private_product_review(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid)
 as first_submission \gset
select set_config('apex.e2e.first_submission',:'first_submission',false);

-- Administrator approves internal *content*, issues a reasoned listing hold,
-- and requests a specific image/document correction.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 current_setting('apex.e2e.first_submission')::uuid,
 'approved_internal','Synthetic metadata reviewed internally');
select public.set_admin_listing_override(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 'require_review','Verify the image and correct the synthetic label');

insert into public.private_media_evidence_events(
 store_id,product_id,submission_id,image_path,review_status,
 identity_reference,rights_reference,note,created_by)
select r.store_id,r.product_id,r.submission_id,r.snapshot->>'image_path',
 'needs_correction','PRIVATE-IDENTITY-REF-2997','PRIVATE-RIGHTS-REF-2997',
 'Replace the synthetic image with the correct product-specific photo.',
 '50000000-0000-4000-8000-000000000003'
from public.private_product_review_states r
where r.product_id=current_setting('apex.e2e.product')::uuid;

-- Different tenant cannot access supplier-only feedback; supplier cannot
-- access original admin evidence references.
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $assert$
begin
 if exists (select 1 from public.supplier_media_feedback_events
     where product_id=current_setting('apex.e2e.product')::uuid)
 then raise exception 'E2E: unrelated supplier saw media correction';end if;
end $assert$;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $assert$
declare row_safe jsonb;
begin
 if exists (select 1 from public.private_media_evidence_events
   where product_id=current_setting('apex.e2e.product')::uuid)
 then raise exception 'E2E: protected admin references exposed to supplier';end if;
 select to_jsonb(x) into row_safe from public.supplier_media_feedback_events x
   where x.product_id=current_setting('apex.e2e.product')::uuid;
 if row_safe is null
 or row_safe->>'supplier_note'<>'Replace the synthetic image with the correct product-specific photo.'
 or row_safe::text like '%PRIVATE-IDENTITY-REF-2997%'
 or row_safe::text like '%PRIVATE-RIGHTS-REF-2997%'
 then raise exception 'E2E: supplier-specific correction not safely delivered';end if;
end $assert$;

-- A held card cannot be republished by the supplier even after fixing content.
do $assert$
declare accepted boolean:=false;
begin
 begin
  perform public.set_supplier_listing_intent(
   current_setting('apex.e2e.store')::uuid,
   current_setting('apex.e2e.product')::uuid,'publish');
  accepted:=true;
 exception when others then null;end;
 if accepted then raise exception 'E2E: admin hold bypassed by supplier';end if;
end $assert$;

-- Supplier changes the actual private image path and description; existing
-- product-change triggers invalidate the old internal review.
update public.products p set
 description='Corrected synthetic label and identity details',
 image_path=p.store_id::text||'/'||p.id::text||'/00000000-0000-4000-8000-000000000074.png'
where p.id=current_setting('apex.e2e.product')::uuid;
do $assert$
begin
 if not exists(select 1 from public.private_product_review_states
  where product_id=current_setting('apex.e2e.product')::uuid
   and status='changes_requested')
 then raise exception 'E2E: edited private image did not invalidate internal approval';end if;
end $assert$;
select public.submit_private_product_review(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid
) as updated_submission \gset
select set_config('apex.e2e.updated_submission',:'updated_submission',false);
select public.resubmit_supplier_listing_corrections(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 'Replaced product image and corrected identity details');

-- Administrator approves the updated *private* content and records a new
-- evidence event for the exact new submission/image.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 current_setting('apex.e2e.updated_submission')::uuid,
 'approved_internal','Corrected synthetic content reviewed internally');
insert into public.private_media_evidence_events(
 store_id,product_id,submission_id,image_path,review_status,
 identity_reference,rights_reference,note,created_by)
select r.store_id,r.product_id,r.submission_id,r.snapshot->>'image_path',
 'evidence_recorded','PRIVATE-VERIFIED-IDENTITY-2997','PRIVATE-VERIFIED-RIGHTS-2997',
 'Recorded corrected image identity and rights evidence for this exact private revision.',
 '50000000-0000-4000-8000-000000000003'
from public.private_product_review_states r
where r.product_id=current_setting('apex.e2e.product')::uuid;
select public.set_admin_listing_override(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 'approve_republish','Synthetic corrections reviewed, but public eligibility not approved');
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.set_supplier_listing_intent(
 current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid,
 'publish');

do $assert$
declare v jsonb;
begin
 if (select count(*) from public.supplier_media_feedback_events
    where product_id=current_setting('apex.e2e.product')::uuid)<>2
 or not exists (select 1 from public.supplier_media_feedback_events
    where product_id=current_setting('apex.e2e.product')::uuid
     and submission_id=current_setting('apex.e2e.updated_submission')::uuid
     and outcome='evidence_recorded' and supplier_note='')
 then raise exception 'E2E: corrected submission not reflected in private feedback';end if;
 if not exists(select 1 from public.supplier_listing_controls
    where product_id=current_setting('apex.e2e.product')::uuid
     and admin_gate='clear' and supplier_wants_listing)
 then raise exception 'E2E: supplier request not restored after admin resolution';end if;
 v:=public.get_private_release_readiness(
  current_setting('apex.e2e.store')::uuid,current_setting('apex.e2e.product')::uuid);
 if v->>'effective_public'<>'false'
 then raise exception 'E2E: request or admin content review bypassed public eligibility';end if;
end $assert$;
reset role;

do $assert$
begin
 if not exists(select 1 from public.supplier_import_candidates c
   where c.id=current_setting('apex.e2e.candidate')::uuid
    and c.review_status='unverified')
 or (select enabled from apex_internal.private_release_gate where singleton)
 or exists(select 1 from public.products
   where id=current_setting('apex.e2e.product')::uuid and is_published)
 or exists(select 1 from public.stores
   where id=current_setting('apex.e2e.store')::uuid and is_public)
 or public.get_public_sold_out_catalog()<>'[]'::jsonb
 then raise exception 'E2E: source approval, release or checkout state changed';end if;
end $assert$;
rollback;

do $assert$
begin
 if exists(select 1 from public.products where sku='SYNTHETIC-E2E-2997')
 or exists(select 1 from public.supplier_import_candidates
  where source_index=2997 and store_id='20000000-0000-4000-8000-000000000003')
 or (select enabled from apex_internal.private_release_gate where singleton)
 then raise exception 'E2E: synthetic fixture leaked or public gate changed';end if;
end $assert$;
\echo PASS: synthetic private source -> edit -> zero-stock request -> admin hold -> image note -> resubmit -> reapprove -> private only, all rolled back.
