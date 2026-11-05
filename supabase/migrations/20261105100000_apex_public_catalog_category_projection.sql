-- Track 1 public category labels: names ONLY for a fully independently
-- released product whose own category is already published. No new listing,
-- inventory or checkout rights, no private category listing endpoint.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regprocedure('public.get_public_inventory_catalog(integer,integer)') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate where singleton=true)
     is distinct from false
  or has_table_privilege('anon','public.inventory_items','SELECT')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
 then raise exception 'Public category projection preflight denied';end if;
end $preflight$;

create or replace function public.get_public_inventory_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000 or
  p_limit is null or p_limit<1 or p_limit>24
 then raise exception 'Invalid catalog page' using errcode='22023';end if;
 if not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,
  'name',eligible.name,
  'description',eligible.description,
  'category_id',eligible.category_id,
  'category_name',eligible.category_name,
  'price_cents',eligible.price_cents::text,
  'currency','USD',
  'availability',eligible.availability,
  'can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents,
   cat.id as category_id,cat.name as category_name,
   case when i.quantity_on_hand>i.quantity_reserved
    then 'in_stock' else 'sold_out' end as availability
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories cat on cat.id=p.category_id
   and cat.store_id=p.store_id and cat.is_published=true
  join public.supplier_listing_controls c
   on c.store_id=p.store_id and c.product_id=p.id
   and c.supplier_wants_listing=true and c.admin_gate='clear'
   and (not c.republish_approval_required or c.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id
   and i.product_id=p.id and i.quantity_on_hand>=0
   and i.quantity_reserved between 0 and i.quantity_on_hand
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
  left join public.private_product_review_states r
   on r.store_id=p.store_id and r.product_id=p.id
  left join public.supplier_candidate_drafts link
   on link.store_id=p.store_id and link.product_id=p.id
  left join public.supplier_import_candidates src
   on src.store_id=p.store_id and src.id=link.candidate_id
  where p.is_published=false and p.is_active=true and p.currency='USD'
   and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(cat.name)) between 1 and 80
   and length(btrim(coalesce(p.description,''))) between 1 and 1500
   and length(coalesce(p.image_path,''))>0
   and coalesce(r.status,'') not in ('pending_review','changes_requested')
   and (link.candidate_id is null or src.review_status='approved_for_draft')
   and not exists(select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name))
  order by p.name,p.id
  limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $fn$;

revoke all on function public.get_public_inventory_catalog(integer,integer)
 from public,anon,authenticated;
grant execute on function public.get_public_inventory_catalog(integer,integer)
 to anon,authenticated;

do $postflight$
declare r jsonb;
begin
 r:=public.get_public_inventory_catalog(0,24);
 if (select enabled from apex_internal.private_release_gate where singleton=true)
     is distinct from false
  or jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>0
  or has_table_privilege('anon','public.inventory_items','SELECT')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
  or not has_function_privilege('anon',
     'public.get_public_inventory_catalog(integer,integer)','EXECUTE')
 then raise exception 'Public category projection postflight denied';end if;
end $postflight$;
commit;
