-- REVIEW ONLY. Apply after separately approved merge to EXISTING Apex Supabase.
-- No publication flags, checkout, orders or payouts changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.private_product_review_states') is null
 or to_regclass('public.private_product_review_history') is null
 or to_regclass('storage.objects') is null
 or not (select relrowsecurity from pg_class where oid='public.private_product_review_states'::regclass)
 or not (select relrowsecurity from pg_class where oid='public.private_product_review_history'::regclass)
 or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass)
 or not exists (
  select 1 from pg_constraint c
  where c.conrelid='public.private_product_review_history'::regclass
    and c.conname='private_product_review_history_event_type_check'
    and pg_get_constraintdef(c.oid) like '%approved_internal%'
 )
 or exists (select 1 from pg_policies where schemaname='storage'
     and tablename='objects' and policyname='apex_admin_read_submitted_image')
 then raise exception 'Private review integrity preflight failed; inspect schema and policy';end if;
end $preflight$;

alter table public.private_product_review_history
 drop constraint private_product_review_history_event_type_check;
alter table public.private_product_review_history
 add constraint private_product_review_history_event_type_check
 check (event_type in ('submitted','resubmitted','changes_requested','approved_internal','review_invalidated'));
-- System maintenance might update catalog rows without a user JWT. Do not
-- misattribute those invalidations to the previously approving admin.
alter table public.private_product_review_history alter column actor_id drop not null;

create or replace function apex_internal.invalidate_private_review(
  p_store_id uuid,p_product_id uuid,p_reason text
)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_saved public.private_product_review_states%rowtype;
 v_note text;
begin
 select * into v_saved from public.private_product_review_states
 where store_id=p_store_id and product_id=p_product_id
 for update;
 if not found or v_saved.status not in ('approved_internal','pending_review')
 then return;end if;

 v_note=case when p_reason='inventory'
 then 'Inventory changed after submission. Update the private draft and resubmit for review.'
 else 'Product details changed after submission. Update the private draft and resubmit for review.'
 end;
 update public.private_product_review_states set
  status='changes_requested',review_note=v_note,
  decided_by=null,decided_at=null,updated_at=now()
 where store_id=p_store_id and product_id=p_product_id;

 insert into public.private_product_review_history
 (store_id,product_id,submission_id,event_type,actor_id,note,snapshot)
 values (p_store_id,p_product_id,v_saved.submission_id,
         'review_invalidated',(select auth.uid()),v_note,v_saved.snapshot);
end $fn$;
revoke all on function apex_internal.invalidate_private_review(uuid,uuid,text)
 from public,anon,authenticated;

create or replace function apex_internal.review_product_change_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if new.is_published=false then
   perform apex_internal.invalidate_private_review(
     new.store_id,new.id,'product');
 end if;
 return new;
end $fn$;
revoke all on function apex_internal.review_product_change_guard()
 from public,anon,authenticated;

create or replace function apex_internal.review_inventory_change_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_store uuid;v_product uuid;
begin
 if tg_op='UPDATE' and
    old.quantity_on_hand is not distinct from new.quantity_on_hand and
    old.quantity_reserved is not distinct from new.quantity_reserved
 then return new;end if;

 if tg_op='DELETE' then
  v_store=old.store_id;v_product=old.product_id;
 else
  v_store=new.store_id;v_product=new.product_id;
 end if;
 perform apex_internal.invalidate_private_review(v_store,v_product,'inventory');
 if tg_op='DELETE' then return old;end if;
 return new;
end $fn$;
revoke all on function apex_internal.review_inventory_change_guard()
 from public,anon,authenticated;

create trigger apex_private_review_product_change_guard
 after update of name,sku,description,category_id,price_cents,
   compare_at_price_cents,image_path,is_active,currency
 on public.products for each row
 when (
  old.name is distinct from new.name or
  old.sku is distinct from new.sku or
  old.description is distinct from new.description or
  old.category_id is distinct from new.category_id or
  old.price_cents is distinct from new.price_cents or
  old.compare_at_price_cents is distinct from new.compare_at_price_cents or
  old.image_path is distinct from new.image_path or
  old.is_active is distinct from new.is_active or
  old.currency is distinct from new.currency
 )
 execute function apex_internal.review_product_change_guard();

create trigger apex_private_review_inventory_change_guard
 after insert or update or delete on public.inventory_items
 for each row execute function apex_internal.review_inventory_change_guard();

-- Allow verified platform administrators to sign short-lived private image
-- URLs only for the image snapshotted on an existing internal review.
-- This does not turn the bucket public or expose unrelated supplier images.
create policy "apex_admin_read_submitted_image" on storage.objects
 for select to authenticated using (
  bucket_id='apex-draft-product-images'
  and (select auth.uid()) is not null
  and (select auth.jwt()) #>> '{app_metadata,apex_role}' = 'platform_admin'
  and exists(
   select 1 from public.private_product_review_states r
    join public.products p on p.store_id=r.store_id and p.id=r.product_id
    join public.stores s on s.id=r.store_id
   where r.snapshot->>'image_path'=objects.name
     and p.is_published=false and s.is_public=false
     and p.store_id::text=split_part(objects.name,'/',1)
     and p.id::text=split_part(objects.name,'/',2)
  )
 );

-- Postflight: existing supplier writes still never grant publishing.
do $postflight$
begin
 if has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 or has_table_privilege('anon','public.private_product_review_states','SELECT')
 or (select count(*) from pg_trigger where tgrelid='public.products'::regclass and
    tgname='apex_private_review_product_change_guard' and not tgisinternal)<>1
 or (select count(*) from pg_trigger where tgrelid='public.inventory_items'::regclass and
    tgname='apex_private_review_inventory_change_guard' and not tgisinternal)<>1
 then raise exception 'Private review integrity postflight failed';end if;
end $postflight$;
commit;
