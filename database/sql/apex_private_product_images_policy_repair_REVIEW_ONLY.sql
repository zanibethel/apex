-- REVIEW ONLY: proposed corrective migration for Apex private draft images.
-- Not applied to any environment. Apply only after an approved migration-history
-- reconciliation and an isolated owner/manager/staff acceptance test.
-- The existing policies incorrectly resolve storage.foldername(name) inside
-- a products p subquery to products.name (p.name), not storage.objects.name.
-- Keep the existing membership and private bucket restrictions unchanged.
begin;

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
 and storage.filename(storage.objects.name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}\\.(png|jpg|webp)$'
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
commit;
