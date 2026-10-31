-- Supabase Storage-specific REVIEW-ONLY setup SQL; use only after review of draft-product membership RLS.\n-- Qualify storage.objects.name in nested EXISTS clauses so it cannot bind to products.name.
-- Private image objects; no public URLs and no overwrite or delete access.
begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('apex-draft-product-images','apex-draft-product-images',false,3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $validate$
begin
 if not exists (
  select 1 from storage.buckets where id='apex-draft-product-images' and public=false
    and file_size_limit=3145728
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
 ) then
   raise exception 'Existing image bucket is not configured as private or restricted';
 end if;
end $validate$;

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
-- In particular, there is NO storage.objects UPDATE/DELETE policy for this bucket:
-- signed upload tokens only grant insert at a single randomized object path.
commit;
