-- Explicit, scoped hard-delete of the retired Apex development catalog.
-- This does not use CASCADE DDL, touch real order lines, alter public checkout,
-- or remove the product-level safeguards and admin overrides.
-- Storage object binaries are not deleted by SQL; see cleanup documentation.
begin;

create temporary table apex_legacy_delete_products on commit drop as
 select p.id,p.store_id,p.category_id,p.image_path
 from public.products p
 where p.archived_at is not null;

create temporary table apex_legacy_delete_categories on commit drop as
 select distinct c.id,c.store_id
 from public.categories c
 join apex_legacy_delete_products a on a.category_id=c.id and a.store_id=c.store_id;

do $preflight$
declare
 v_products integer;
 v_categories integer;
 v_candidates integer;
begin
 select count(*) into v_products from apex_legacy_delete_products;
 select count(*) into v_categories from apex_legacy_delete_categories;
 if v_products <> 63 or v_categories <> 9 then
   raise exception 'Archived catalog drift: expected 63 products and 9 legacy-only categories, found % products and % categories',
     v_products,v_categories;
 end if;
 if (select count(distinct store_id) from apex_legacy_delete_products) <> 1 then
   raise exception 'Archived catalog spans multiple stores';
 end if;
 if exists(
   select 1 from apex_legacy_delete_categories c
   join public.products p on p.category_id=c.id and p.store_id=c.store_id
   where p.archived_at is null
 ) then raise exception 'Cannot delete a category used by active retail products';end if;
 if exists(
   select 1 from public.apex_category_publication_events e
   join apex_legacy_delete_categories c on c.id=e.category_id and c.store_id=e.store_id
 ) then raise exception 'Cannot delete categories with publication history';end if;
 if exists(
   select 1 from apex_internal.order_line_snapshots o
   join apex_legacy_delete_products a on a.id=o.product_id and a.store_id=o.store_id
 ) or exists(
   select 1 from apex_internal.public_media_asset_versions_v1 v
   join apex_legacy_delete_products a on a.id=v.product_id and a.store_id=v.store_id
 ) or exists(
   select 1 from public.apex_product_tax_setting_events t
   join apex_legacy_delete_products a on a.id=t.product_id
 ) then raise exception 'Cannot hard-delete records with protected commercial or publication references';end if;
 if exists(
   select 1 from apex_legacy_delete_products a
   join public.products p on p.id=a.id and p.store_id=a.store_id
   where p.is_published=true
 ) then raise exception 'Archived product unexpectedly published';end if;

 select count(*) into v_candidates
 from public.supplier_candidate_drafts d
 join apex_legacy_delete_products a on a.id=d.product_id and a.store_id=d.store_id;
 if v_candidates <> 63 then
   raise exception 'Expected 63 retired draft-import links; found %',v_candidates;
 end if;
 if (select count(*) from public.products where archived_at is null) < 5 then
   raise exception 'Current retail catalog baseline is incomplete';
 end if;
end $preflight$;

-- These candidate links are ON DELETE RESTRICT, so explicitly delete only
-- the 63 links to the retired products, then delete the products themselves.
-- Existing ON DELETE CASCADE constraints clean their private inventory and
-- listing/review history. No non-archived row is matched.
delete from public.supplier_candidate_drafts d
using apex_legacy_delete_products a
where d.product_id=a.id and d.store_id=a.store_id;

delete from public.products p
using apex_legacy_delete_products a
where p.id=a.id and p.store_id=a.store_id
 and p.archived_at is not null and p.is_published=false;

-- Remove ONLY the nine categories that belonged exclusively to the retired
-- catalog; other categories and retail items stay unchanged.
delete from public.categories c
using apex_legacy_delete_categories a
where c.id=a.id and c.store_id=a.store_id
 and not exists(
  select 1 from public.products p
  where p.category_id=c.id and p.store_id=c.store_id
 );

do $postcheck$
begin
 if exists(select 1 from public.products where archived_at is not null) then
  raise exception 'Archived catalog was not completely deleted';
 end if;
 if exists(select 1 from public.supplier_candidate_drafts d
    join apex_legacy_delete_products a on a.id=d.product_id and a.store_id=d.store_id)
 then raise exception 'Archived candidate records remain';end if;
 if exists(select 1 from public.categories c
   join apex_legacy_delete_categories a on a.id=c.id and a.store_id=c.store_id)
 then raise exception 'Legacy-only categories remain';end if;
 if (select count(*) from public.products where archived_at is null) < 5 then
  raise exception 'Unexpected loss of active retail products';end if;
end $postcheck$;

-- Public category eligibility is now only "belongs to the supplier store".
-- The product itself still must pass the existing content, completeness,
-- supplier-auth, admin-hold and inventory validity checks before display.
create or replace function apex_internal.retail_showcase_category_allowed(
 p_store_id uuid,p_category_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(exists(
  select 1 from public.categories c
  where c.id=p_category_id and c.store_id=p_store_id
 ),false)
$$;
revoke all on function apex_internal.retail_showcase_category_allowed(uuid,uuid)
 from public,anon,authenticated;

commit;