-- Automatically display the current private-backed photo for a supplier-published
-- retail showcase product. No extra image review or license-approval workflow.
-- The actual Storage bucket stays PRIVATE; only the Supabase Edge worker (the
-- service_role) can resolve the product-scoped private image path.
-- Neither checkout nor the separately controlled reviewed-media pipeline changes.
begin;

create or replace function public.apex_retail_showcase_image_source_v1(p_product uuid)
returns jsonb
language sql stable security definer
set search_path=pg_catalog
as $$
  select jsonb_build_object('source_image_path',p.image_path)
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.supplier_listing_controls lc
   on lc.store_id=p.store_id and lc.product_id=p.id
   and lc.supplier_wants_listing=true
   and lc.admin_gate='clear'
   and (not lc.republish_approval_required or lc.republish_approved)
  left join public.categories c on c.id=p.category_id and c.store_id=p.store_id
  where p.id=p_product
   and exists(select 1 from apex_internal.retail_showcase_gate g
     where g.singleton=true and g.enabled=true)
   and (p.category_id is null or
     apex_internal.retail_showcase_category_allowed(p.store_id,c.id))
   and p.archived_at is null and p.is_published=false and p.is_active=true
   and p.currency='USD' and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,''))) between 1 and 1500
   and p.image_path ~ (
     '^' || p.store_id::text || '/' || p.id::text ||
     '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
   )
   and not exists (select 1 from apex_internal.retail_product_visibility_restrictions r
     where r.store_id=p.store_id and r.product_id=p.id and r.is_restricted=true)
   and not exists(select 1 from public.private_product_review_states r
     where r.store_id=p.store_id and r.product_id=p.id
     and r.status in ('pending_review','changes_requested'))
   and not exists(select 1 from public.supplier_candidate_drafts d
     where d.store_id=p.store_id and d.product_id=p.id)
   and not exists(select 1 from apex_internal.listing_identity_holds h
     where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name))
  limit 1;
$$;

-- Must not expose private image paths to the Data API anon/authenticated roles.
-- SUPABASE_SERVICE_ROLE_KEY remains only inside the Edge worker.
revoke all on function public.apex_retail_showcase_image_source_v1(uuid) from public,anon,authenticated;
grant execute on function public.apex_retail_showcase_image_source_v1(uuid) to service_role;

comment on function public.apex_retail_showcase_image_source_v1(uuid) is
 'Service-role only: resolve the current supplier-published retail showcase image path; no media approval, public bucket, or checkout privilege.';
commit;
