-- REVIEW ONLY. The public SOLD OUT view is a narrowly scoped read-only
-- projection, not an order/cart listing. Do not enable the independent global
-- release gate until legal/product eligibility review has been completed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $check$
begin
 if to_regclass('apex_internal.private_release_gate') is null
    or to_regclass('apex_internal.product_release_authorizations') is null
    or to_regclass('apex_internal.supplier_release_authorizations') is null
    or not exists (select 1 from apex_internal.private_release_gate
      where singleton=true and enabled=false)
 then raise exception 'Apex verified-only catalog preflight failed';end if;
end $check$;

-- The base catalog remains PRIVATE (products.is_published=false, stores.is_public=false).
-- Only this tightly filtered projection can eventually expose approved metadata.
-- No image paths, source costs, private stock, compare-at prices, or payment
-- identifiers are returned. Stock is intentionally not a listing blocker:
-- every approved listing is represented as Sold Out while checkout is disabled.
create or replace function public.get_public_sold_out_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000
   or p_limit is null or p_limit<1 or p_limit>24
 then raise exception 'Invalid catalog page' using errcode='22023';end if;
 if not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,'name',eligible.name,
  'description',eligible.description,
  'price_cents',eligible.price_cents::text,
  'currency','USD','availability','sold_out','can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories cat on cat.id=p.category_id
     and cat.store_id=p.store_id and cat.is_published=true
  join public.supplier_listing_controls c on c.store_id=p.store_id
     and c.product_id=p.id and c.supplier_wants_listing=true
     and c.admin_gate='clear'
     and (not c.republish_approval_required or c.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
  join apex_internal.supplier_release_authorizations sa
    on sa.supplier_id=s.supplier_id and sa.status='verified'
    and sa.valid_until>=current_date
    and sa.reviewed_at is not null and sa.reviewed_by is not null
    and length(btrim(coalesce(sa.evidence_reference,'')))>0
  join apex_internal.product_release_authorizations pa
    on pa.store_id=p.store_id and pa.product_id=p.id
    and pa.status='verified' and pa.valid_until>=current_date
    and pa.reviewed_at is not null and pa.reviewed_by is not null
    and length(btrim(coalesce(pa.evidence_reference,'')))>0
  left join public.private_product_review_states r on r.store_id=p.store_id
    and r.product_id=p.id
  left join public.supplier_candidate_drafts link on link.store_id=p.store_id
    and link.product_id=p.id
  left join public.supplier_import_candidates src on src.store_id=p.store_id
    and src.id=link.candidate_id
  where p.is_published=false and p.is_active=true and p.currency='USD'
   and p.price_cents>0 and length(btrim(p.name))>0
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,'')))>0
   and length(coalesce(p.image_path,''))>0
   and i.quantity_on_hand>=0 and i.quantity_reserved between 0 and i.quantity_on_hand
   and coalesce(r.status,'') not in ('pending_review','changes_requested')
   and (link.candidate_id is null or src.review_status='approved_for_draft')
   and not exists(
    select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
      and h.signature=apex_internal.listing_signature(p.name)
   )
  order by p.name,p.id
  limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $fn$;
-- Replace any legacy no-argument public feed with the same strict filter.
-- An explicit two-argument signature avoids PostgREST overload ambiguity.
create or replace function public.get_public_sold_out_catalog()
 returns jsonb language sql stable security definer set search_path=pg_catalog as $legacy$
 select public.get_public_sold_out_catalog(0,24);
$legacy$;
revoke all on function public.get_public_sold_out_catalog() from public,anon,authenticated;
grant execute on function public.get_public_sold_out_catalog() to anon,authenticated;

revoke all on function public.get_public_sold_out_catalog(integer,integer)
 from public,anon,authenticated;
grant execute on function public.get_public_sold_out_catalog(integer,integer)
 to anon,authenticated;

do $post$
begin
 if has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
    or has_table_privilege('anon','public.inventory_items','SELECT')
    or has_column_privilege('authenticated','public.products','is_published','UPDATE')
    or not has_function_privilege('anon',
      'public.get_public_sold_out_catalog(integer,integer)','EXECUTE')
    or not exists(select 1 from apex_internal.private_release_gate
       where singleton=true and enabled=false)
 then raise exception 'Apex public view safety postflight failed';end if;
end $post$;
commit;
