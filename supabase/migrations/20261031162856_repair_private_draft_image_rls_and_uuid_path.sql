-- APPLIED TO EXISTING APEX SUPABASE on 2026-10-31 via Supabase apply_migration.
-- Hosted history version: 20261031162856; migration name: repair_private_draft_image_rls_and_uuid_path.
-- DO NOT replay this on the same live database. Future fresh environments need the
-- preceding private catalog and Storage foundation SQL first. No test DB was created.
-- Atomic scope: correct two draft-image storage policies and one products path constraint.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $preflight$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'apex_member_upload_draft_image'
       and position('storage.foldername(p.name)' in with_check) > 0
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'apex_member_read_draft_image'
       and position('storage.foldername(p.name)' in qual) > 0
  ) then
    raise exception 'Apex image policy definitions changed; re-audit before repair';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'apex-draft-product-images' and public = false
      and file_size_limit = 3145728
  ) then
    raise exception 'Apex draft image bucket preflight failed';
  end if;
end $preflight$;

drop policy "apex_member_upload_draft_image" on storage.objects;
drop policy "apex_member_read_draft_image" on storage.objects;

create policy "apex_member_upload_draft_image" on storage.objects
for insert to authenticated with check (
 bucket_id='apex-draft-product-images'
 and array_length(storage.foldername(storage.objects.name),1)=2
 and storage.filename(storage.objects.name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
 and exists (
  select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.store_id::text=(storage.foldername(storage.objects.name))[1]
     and p.id::text=(storage.foldername(storage.objects.name))[2]
     and p.is_published=false and s.is_public=false
     and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 )
);

create policy "apex_member_read_draft_image" on storage.objects
for select to authenticated using (
 bucket_id='apex-draft-product-images'
 and array_length(storage.foldername(storage.objects.name),1)=2
 and exists (
  select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.store_id::text=(storage.foldername(storage.objects.name))[1]
     and p.id::text=(storage.foldername(storage.objects.name))[2]
     and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 )
);
-- No UPDATE/DELETE, public listing, or published-image permission added.

DO $preflight$
DECLARE old_definition text;
BEGIN
 SELECT pg_get_constraintdef(c.oid) INTO old_definition
 FROM pg_constraint c
 WHERE c.conrelid='public.products'::regclass
   AND c.conname='products_private_image_path';

 IF old_definition IS NULL
   OR position('[89ab][0-9a-f]{3}' in old_definition) = 0
   OR position('-[0-9a-f]{12}' in old_definition) > 0
 THEN
   RAISE EXCEPTION 'Apex product image-path constraint changed; re-audit before repair';
 END IF;
END $preflight$;

ALTER TABLE public.products DROP CONSTRAINT products_private_image_path;
ALTER TABLE public.products ADD CONSTRAINT products_private_image_path
 CHECK (
   image_path IS NULL OR (
     char_length(image_path) <= 180
     AND image_path ~ (
       '^' || store_id::text || '/' || id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
     )
   )
 );


do $verify$
declare constraint_definition text;
begin
 select pg_get_constraintdef(oid) into constraint_definition
 from pg_constraint where conrelid='public.products'::regclass
 and conname='products_private_image_path';
 if constraint_definition is null
    or position('-[0-9a-f]{12}' in constraint_definition)=0 then
   raise exception 'Post-migration: full UUID image path constraint not present';
 end if;
 if (select count(*) from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname in ('apex_member_upload_draft_image','apex_member_read_draft_image')
       and roles=array['authenticated']::name[]
       and coalesce(qual,'') not like '%storage.foldername(p.name)%'
       and coalesce(with_check,'') not like '%storage.foldername(p.name)%'
       and (coalesce(qual,'') like '%storage.foldername(objects.name)%'
           or coalesce(with_check,'') like '%storage.foldername(objects.name)%')) <> 2 then
   raise exception 'Post-migration: draft image policies not correctly scoped';
 end if;
 if not exists(select 1 from pg_policies
  where schemaname='storage' and tablename='objects'
   and policyname='apex_member_upload_draft_image'
   and position('-[0-9a-f]{12}' in with_check)>0) then
   raise exception 'Post-migration: full UUID filename restriction missing';
 end if;
 if not exists(select 1 from storage.buckets
   where id='apex-draft-product-images' and public=false
    and file_size_limit=3145728) then
   raise exception 'Post-migration: image bucket constraints changed';
 end if;
end $verify$;

commit;
