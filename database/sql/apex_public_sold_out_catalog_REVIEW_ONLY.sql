-- REVIEW ONLY — DO NOT APPLY TO HOSTED APEX.
-- Public READ-ONLY projection for independently authorized, actually zero-stock
-- products. This is intentionally unable to return rows under Apex's current
-- private_release_gate.enabled=false CHECK constraint.
--
-- Requires separately reviewed legal/merchant/product release, verified
-- product-specific public media, and a separately approved release-gate
-- migration before any deployment or nonempty public response.
--
-- SECURITY DEFINER is needed because authorization records are private.
-- Every output field is explicit and the function never returns private cost,
-- exact inventory count, storage image path, customer data or payout settings.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.private_release_gate') is null
 or to_regclass('apex_internal.supplier_release_authorizations') is null
 or to_regclass('apex_internal.product_release_authorizations') is null
 or to_regclass('apex_internal.listing_identity_holds') is null
 or to_regclass('public.supplier_listing_controls') is null
 or to_regclass('public.private_product_review_states') is null
 or not exists(select 1 from apex_internal.private_release_gate
               where singleton=true and enabled=false)
 then raise exception 'Public sold-out catalog preflight failed: release gate must be off';
 end if;
end $preflight$;

create or replace function public.get_public_sold_out_catalog()
returns jsonb
language sql stable security definer set search_path=pg_catalog as $fn$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',approved.id,
  'name',approved.name,
  'description',approved.description,
  'price_cents',approved.price_cents::text,
  'currency','USD',
  'availability','sold_out',
  'can_checkout',false
 ) order by approved.name,approved.id),'[]'::jsonb)
 from (
  select p.id,p.name,p.description,p.price_cents
  from public.products p
  join public.stores s on s.id=p.store_id
  join public.categories cat on cat.id=p.category_id
     and cat.store_id=p.store_id
  join public.inventory_items inv on inv.store_id=p.store_id
     and inv.product_id=p.id
  join public.supplier_listing_controls lc on lc.store_id=p.store_id
     and lc.product_id=p.id
  join apex_internal.supplier_release_authorizations sa on sa.supplier_id=s.supplier_id
  join apex_internal.product_release_authorizations pa
     on pa.store_id=p.store_id and pa.product_id=p.id
  join apex_internal.private_release_gate gate
     on gate.singleton=true and gate.enabled=true
  left join public.private_product_review_states review
     on review.store_id=p.store_id and review.product_id=p.id
  where p.is_published=true
    and p.is_active=true
    and s.is_public=true
    and cat.is_published=true
    and p.currency='USD' and p.price_cents between 1 and 999999999
    and length(btrim(p.name)) between 1 and 120
    and length(btrim(coalesce(p.description,'')))>0
    and length(btrim(coalesce(p.image_path,'')))>0
    and inv.quantity_on_hand=0 and inv.quantity_reserved=0
    and lc.supplier_wants_listing=true and lc.admin_gate='clear'
    and (lc.republish_approval_required=false or lc.republish_approved=true)
    and sa.status='verified' and sa.valid_until>=current_date
    and pa.status='verified' and pa.valid_until>=current_date
    and (review.status is null
      or review.status not in ('pending_review','changes_requested'))
    and not exists (
     select 1 from apex_internal.listing_identity_holds hold
      where hold.supplier_id=s.supplier_id and hold.active=true
        and hold.signature=apex_internal.listing_signature(p.name)
    )
  order by p.name,p.id
  limit 24
 ) approved;
$fn$;
revoke all on function public.get_public_sold_out_catalog()
 from public,anon,authenticated;
grant execute on function public.get_public_sold_out_catalog()
 to anon,authenticated;

-- Structural check: no product can appear with the present hard-disabled
-- release gate, even if tables later contain publication flags.
do $postflight$
declare v jsonb;
begin
 select public.get_public_sold_out_catalog() into v;
 if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>0 then
  raise exception 'Public sold-out catalog must remain empty while release gate is off';
 end if;
 if not has_function_privilege('anon','public.get_public_sold_out_catalog()','EXECUTE')
 then raise exception 'Public read-only function not exposed as intended';end if;
end $postflight$;
commit;
