-- CI only: run after the full synthetic private product review integration.
-- NEVER execute against the existing hosted Apex Supabase database.
\set ON_ERROR_STOP on
create schema if not exists storage;
create table storage.objects (
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null,
 name text not null unique
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select on storage.objects to authenticated;
\ir ../sql/apex_review_integrity_admin_images_REVIEW_ONLY.sql

do $assert$
begin
 if has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 or has_table_privilege('anon','storage.objects','SELECT')
 then raise exception 'Review integrity changed public or storage grants';end if;
end $assert$;

-- Use source product image path from the existing synthetic submitted snapshot.
insert into storage.objects(bucket_id,name)
select 'apex-draft-product-images',snapshot->>'image_path'
from public.private_product_review_states where status='approved_internal';
insert into storage.objects(bucket_id,name)
values ('apex-draft-product-images','00000000-0000-4000-8000-000000000030/00000000-0000-4000-8000-000000000031/00000000-0000-4000-8000-000000000032.png');

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','',false);
do $check$
begin
 if (select count(*) from storage.objects)<>0 then
  raise exception 'Non-admin obtained private submitted images';end if;
end $check$;

select set_config('request.jwt.claim.apex_role','platform_admin',false);
do $check$
begin
 if (select count(*) from storage.objects)<>1 then
  raise exception 'Admin cannot read exactly the submitted private image';end if;
end $check$;
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);

-- No-op writes must not invalidate approval.
update public.products set name=name where sku='APX-BETA-DRAFT-001';
do $check$
begin
 if (select status from public.private_product_review_states limit 1)<>'approved_internal'
 or (select count(*) from public.private_product_review_history where event_type='review_invalidated')<>0
 then raise exception 'No-op product write invalidated valid review';end if;
end $check$;

-- Meaningful supplier edit changes the state, and audit preserves prior approval.
update public.products set description='Changed after approval'
where sku='APX-BETA-DRAFT-001' and is_published=false;
do $check$
begin
 if (select status from public.private_product_review_states limit 1)<>'changes_requested'
 or (select count(*) from public.private_product_review_history where event_type='review_invalidated')<>1
 or (select note from public.private_product_review_history where event_type='review_invalidated' limit 1) not like '%Product details%'
 then raise exception 'Changed description did not revoke prior approval';end if;
end $check$;

-- Resubmit the edited draft; admin reapproves only the new submission.
select public.submit_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-001'));
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
select public.decide_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select product_id from public.private_product_review_states limit 1),
 (select submission_id from public.private_product_review_states limit 1),
 'approved_internal','Rechecked edited draft');
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);

update public.inventory_items set quantity_on_hand=6
where store_id='20000000-0000-4000-8000-000000000003'
 and product_id=(select id from public.products where sku='APX-BETA-DRAFT-001');
do $check$
begin
 if (select status from public.private_product_review_states limit 1)<>'changes_requested'
 or (select count(*) from public.private_product_review_history where event_type='review_invalidated')<>2
 then raise exception 'Inventory change did not revoke approval';end if;
end $check$;
update public.inventory_items set quantity_on_hand=quantity_on_hand
where store_id='20000000-0000-4000-8000-000000000003'
 and product_id=(select id from public.products where sku='APX-BETA-DRAFT-001');
do $check$
begin
 if (select count(*) from public.private_product_review_history where event_type='review_invalidated')<>2
 then raise exception 'No-op inventory update repeated invalidation';end if;
end $check$;

-- Pending review must also become changes requested if metadata mutates.
select public.submit_private_product_review(
 '20000000-0000-4000-8000-000000000003',
 (select id from public.products where sku='APX-BETA-DRAFT-001'));
update public.products set sku='APX-BETA-DRAFT-002'
where sku='APX-BETA-DRAFT-001' and is_published=false;
do $check$
begin
 if (select status from public.private_product_review_states limit 1)<>'changes_requested'
 or (select count(*) from public.private_product_review_history where event_type='review_invalidated')<>3
 then raise exception 'Changed pending review remained pending';end if;
end $check$;

reset role;
do $check$
begin
 -- Existing synthetic fixture includes other published products in this
 -- supplier's store. Assert only the submitted review product stayed private.
 if exists (
  select 1 from public.private_product_review_states r
  join public.products p on p.id=r.product_id and p.store_id=r.store_id
  where p.is_published
 ) then raise exception 'Review integrity published the submitted product';end if;
 if exists(select 1 from public.stores where id='20000000-0000-4000-8000-000000000003' and is_public)
 then raise exception 'Review integrity published the supplier store';end if;
end $check$;
\echo PASS: reviewed product/inventory edits invalidate approval; private images remain admin-only.
