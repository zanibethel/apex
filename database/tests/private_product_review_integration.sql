-- CI-only review workflow tests. Uses existing synthetic catalog fixtures.
-- NEVER execute this script against the hosted Apex Supabase database.
\set ON_ERROR_STOP on

create or replace function auth.jwt() returns jsonb language sql stable as $fn$
 select jsonb_build_object('app_metadata',jsonb_build_object(
  'apex_role',nullif(current_setting('request.jwt.claim.apex_role',true),'')
 ));
$fn$;
grant execute on function auth.jwt() to authenticated;
\ir ../sql/apex_private_product_review_REVIEW_ONLY.sql

-- Existing CI media fixture is older than the deployed October 31 UUID-tail
-- repair. Mirror the already-applied hosted image-path constraint in CI only.
alter table public.products drop constraint products_private_image_path;
alter table public.products add constraint products_private_image_path check (
 image_path is null or
 (char_length(image_path)<=180 and
  image_path ~ ('^' || store_id::text || '/' || id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|jpg|webp)'))
);

-- Synthetic beta private product already created by earlier CI catalog fixtures.
update public.products p set
 description='Synthetic internal review only',
 category_id='30000000-0000-4000-8000-000000000005',
 is_active=true,
 image_path=p.store_id::text||'/'||p.id::text||'/00000000-0000-4000-8000-000000000010.png'
where sku='APX-BETA-DRAFT-001' and store_id='20000000-0000-4000-8000-000000000003';
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
select p.store_id,p.id,5,0 from public.products p
where p.sku='APX-BETA-DRAFT-001'
on conflict(store_id,product_id) do update set quantity_on_hand=5,quantity_reserved=0;

do $assert$
begin
 if not exists(select 1 from public.products where sku='APX-BETA-DRAFT-001' and image_path is not null)
 then raise exception 'Synthetic review test product not prepared'; end if;
 if has_table_privilege('authenticated','public.private_product_review_states','INSERT')
 or has_table_privilege('authenticated','public.private_product_review_states','UPDATE')
 or has_table_privilege('authenticated','public.private_product_review_history','INSERT')
 or has_table_privilege('anon','public.private_product_review_states','SELECT')
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 then raise exception 'Review workflow exposed mutation or publication privilege'; end if;
end $assert$;

set role authenticated;
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $assert$
declare succeeded boolean:=false;
begin
 begin
  perform public.submit_private_product_review(
   '20000000-0000-4000-8000-000000000003',
   (select id from public.products where sku='APX-BETA-DRAFT-001'));
  succeeded:=true;
 exception when others then null; end;
 if succeeded then raise exception 'Cross-supplier submission accepted'; end if;
 if (select count(*) from public.private_product_review_states)<>0
 then raise exception 'Cross-supplier reviews leaked'; end if;
end $assert$;

-- Beta manager submits a completed private draft.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.submit_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-001'));
do $assert$
begin
 if (select count(*) from public.private_product_review_states where status='pending_review')<>1
 or (select count(*) from public.private_product_review_history where event_type='submitted')<>1
 then raise exception 'Submission not persisted/audited'; end if;
end $assert$;
do $assert$
declare succeeded boolean:=false;
begin
 begin
  perform public.decide_private_product_review(
   '20000000-0000-4000-8000-000000000003',
   (select product_id from public.private_product_review_states limit 1),
   (select submission_id from public.private_product_review_states limit 1),
   'approved_internal','Wrong reviewer');
  succeeded:=true;
 exception when others then null;end;
 if succeeded then raise exception 'Supplier created an admin decision';end if;
end $assert$;

-- Confirm a signed-in non-admin with no app_metadata claim cannot approve.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
do $assert$
declare succeeded boolean:=false;
begin
 begin
  perform public.decide_private_product_review(
   '20000000-0000-4000-8000-000000000003',
   (select product_id from public.products where sku='APX-BETA-DRAFT-001'),
   (select submission_id from public.private_product_review_states limit 1),
   'approved_internal','');
  succeeded:=true;
 exception when others then null;end;
 if succeeded then raise exception 'Non-admin without JWT claim approved';end if;
end $assert$;

-- Simulate a JWT containing a server-controlled platform admin app_metadata role.
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select product_id from public.private_product_review_states limit 1),
 (select submission_id from public.private_product_review_states limit 1),
 'changes_requested','Please revise the description for internal review');
do $assert$
begin
 if (select status from public.private_product_review_states limit 1)<>'changes_requested'
 or (select count(*) from public.private_product_review_history where event_type='changes_requested')<>1
 then raise exception 'Admin requested changes not recorded';end if;
end $assert$;

-- Supplier resubmits, previous note remains in immutable history.
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select public.submit_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select product_id from public.private_product_review_states limit 1));
do $assert$
begin
 if (select count(*) from public.private_product_review_history where event_type='resubmitted')<>1
 then raise exception 'Resubmission history missing';end if;
end $assert$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select product_id from public.private_product_review_states limit 1),
 (select submission_id from public.private_product_review_states limit 1),
 'approved_internal','Metadata looks complete for internal use');
do $assert$
begin
 if (select status from public.private_product_review_states limit 1)<>'approved_internal'
 or (select count(*) from public.private_product_review_history)<>4
 or exists(select 1 from public.products where sku='APX-BETA-DRAFT-001' and is_published=true)
 or exists(select 1 from public.stores where id='20000000-0000-4000-8000-000000000003' and is_public=true)
 then raise exception 'Decision did not record or exposed storefront';end if;
end $assert$;

reset role;
\echo PASS: isolated private supplier review, admin JWT gate, resubmit/audit, no publication.
