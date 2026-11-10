-- Optional supplier-owned discovery tags. ADDITIVE: no automatic publication or payment changes.
-- Apply only after review/checks, before deploying the code that reads or writes tags.
begin;
alter table public.products add column if not exists tags text[] not null default array[]::text[];

create or replace function public.valid_apex_product_tags(value text[])
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare item text;
begin
 if value is null or cardinality(value)>12 then return false;end if;
 foreach item in array value loop
  if item is null or char_length(item)<1 or char_length(item)>40 or
     item ~ '[[:cntrl:]|]' or item<>lower(btrim(item))
  then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function public.valid_apex_product_tags(text[]) from public;
grant execute on function public.valid_apex_product_tags(text[]) to authenticated;
alter table public.products add constraint apex_product_tags_bounded_v1
 check(public.valid_apex_product_tags(tags));

-- Preserve every public supplier/stock/admin/hold/review predicate from the existing
-- checkout-disabled retail feed. Include tags only for already eligible products.
create or replace function public.get_public_retail_showcase_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000 or
    p_limit is null or p_limit<1 or p_limit>24
 then raise exception 'Invalid showcase page' using errcode='22023';end if;
 if not exists(select 1 from apex_internal.retail_showcase_gate
  where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,'name',eligible.name,'description',eligible.description,
  'category_id',eligible.category_id,'category_name',eligible.category_name,
  'price_cents',eligible.price_cents::text,'currency','USD',
  'availability',eligible.availability,'can_checkout',false,
  'tags',eligible.tags
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents,p.tags,
   c.id as category_id,c.name as category_name,
   case when i.quantity_on_hand>i.quantity_reserved then 'in_stock'
    else 'sold_out' end as availability
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories c on c.id=p.category_id and c.store_id=p.store_id
  join public.supplier_listing_controls lc on
   lc.store_id=p.store_id and lc.product_id=p.id
   and lc.supplier_wants_listing=true and lc.admin_gate='clear'
   and (not lc.republish_approval_required or lc.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id
   and i.product_id=p.id and i.quantity_on_hand>=0
   and i.quantity_reserved between 0 and i.quantity_on_hand
  where apex_internal.retail_showcase_category_allowed(p.store_id,c.id)
   and p.archived_at is null and p.is_published=false and p.is_active=true
   and p.currency='USD' and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,''))) between 1 and 1500
   and (p.name||' '||coalesce(p.description,'')) !~*
    '(peptide|anabolic|steroid|testosterone|trenbolone|injectable|research use only|not for human consumption)'
   and not exists(select 1 from public.private_product_review_states r
    where r.store_id=p.store_id and r.product_id=p.id
     and r.status in ('pending_review','changes_requested'))
   and not exists(select 1 from public.supplier_candidate_drafts d
    where d.store_id=p.store_id and d.product_id=p.id)
   and not exists(select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name))
  order by p.name,p.id limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $$;

commit;
