-- Supplier-controlled public display of ordinary retail showcase products.
-- This is a non-transactional display lane. It NEVER enables old release gate,
-- product.is_published, cart admission/payment, BTCPay or Prism.
-- Category-based allowlist applies only to the explicitly named sample retail
-- categories; archived records and reviewed/held content stay excluded.
begin;

create table if not exists apex_internal.retail_showcase_gate (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 changed_at timestamptz not null default now()
);
insert into apex_internal.retail_showcase_gate(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;
revoke all on apex_internal.retail_showcase_gate from public,anon,authenticated;

create or replace function public.get_retail_showcase_gate()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select enabled from apex_internal.retail_showcase_gate where singleton=true),false)
$$;
revoke all on function public.get_retail_showcase_gate() from public;
grant execute on function public.get_retail_showcase_gate() to authenticated;

-- The original supplier listing-intent workflow remains authoritative.
-- For neutral sample-retail categories, allow display even at zero inventory,
-- without treating public browsing as a checkout/product authorization.
create or replace function public.set_supplier_listing_intent(
 p_store_id uuid,p_product_id uuid,p_action text
) returns text language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_actor uuid:=(select auth.uid());
 v_state public.supplier_listing_controls%rowtype;
 v_product public.products%rowtype;
 v_category text;
 v_retail boolean:=false;
 v_showcase_enabled boolean:=false;
begin
 if v_actor is null or p_action is null or p_action not in ('publish','unpublish') or
 not exists (
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and s.is_public=false
   and m.user_id=v_actor and m.role in ('owner','manager')
 ) then
  raise exception 'Authorized supplier owner/manager access required';
 end if;
 select p.* into v_product from public.products p
 where p.store_id=p_store_id and p.id=p_product_id
  and p.is_published=false and p.archived_at is null for update;
 if not found then raise exception 'Private unarchived product unavailable';end if;
 select c.slug into v_category from public.categories c
 where c.id=v_product.category_id and c.store_id=p_store_id;
 v_retail:=coalesce(v_category in ('sample-apparel','sample-accessories'),false);

 insert into public.supplier_listing_controls(store_id,product_id,product_name,product_sku)
 values(p_store_id,p_product_id,v_product.name,v_product.sku)
 on conflict(store_id,product_id) do update
 set product_name=excluded.product_name,product_sku=excluded.product_sku;
 select * into v_state from public.supplier_listing_controls
 where store_id=p_store_id and product_id=p_product_id for update;

 if p_action='publish' then
  if v_state.admin_gate<>'clear' or
   (v_state.republish_approval_required and not v_state.republish_approved)
  then raise exception 'Admin hold or review prevents listing';end if;
  if v_retail then
   if not v_product.is_active or v_product.price_cents<1 or
    v_product.price_cents>999999999 or v_product.currency<>'USD' or
    length(btrim(v_product.name)) not between 1 and 120 or
    length(btrim(v_product.sku))<1 or
    length(btrim(coalesce(v_product.description,''))) not between 1 and 1500
   then raise exception 'Complete retail product details before public display';end if;
   -- Misclassified regulated product names are not eligible for this narrowly
   -- scoped neutral retail display. This is not a substitute for live selling review.
   if (v_product.name||' '||coalesce(v_product.description,'')) ~*
    '(peptide|anabolic|steroid|testosterone|trenbolone|injectable|research use only|not for human consumption)'
   then raise exception 'Only ordinary retail products are eligible for this showcase';end if;
   if exists(select 1 from public.private_product_review_states r
    where r.store_id=p_store_id and r.product_id=p_product_id
     and r.status in ('pending_review','changes_requested'))
   or exists(select 1 from public.supplier_candidate_drafts d
    where d.store_id=p_store_id and d.product_id=p_product_id)
   or exists(select 1 from apex_internal.listing_identity_holds h
    join public.stores s on s.supplier_id=h.supplier_id
    where s.id=p_store_id and h.active
     and h.signature=apex_internal.listing_signature(v_product.name))
   then raise exception 'Product is still held for review or is a linked supplier import';end if;
   if not exists(select 1 from public.inventory_items i
     where i.product_id=p_product_id and i.store_id=p_store_id
       and i.quantity_on_hand>=0 and i.quantity_reserved between 0 and i.quantity_on_hand)
   then raise exception 'Create a valid inventory record before public display';end if;
  elsif apex_internal.private_product_review_snapshot(p_store_id,p_product_id) is null then
   raise exception 'Complete product details and stock before requesting publication';
  end if;
  update public.supplier_listing_controls set
   supplier_wants_listing=true,changed_by=v_actor,changed_at=now()
  where store_id=p_store_id and product_id=p_product_id;
 else
  update public.supplier_listing_controls set
   supplier_wants_listing=false,changed_by=v_actor,changed_at=now()
  where store_id=p_store_id and product_id=p_product_id;
 end if;

 insert into public.supplier_listing_events(store_id,product_id,action,actor_id)
 values(p_store_id,p_product_id,
  case when p_action='publish' then 'publish_requested' else 'unpublish_requested' end,v_actor);

 select enabled into v_showcase_enabled
 from apex_internal.retail_showcase_gate where singleton=true;
 if v_retail then
  if p_action='unpublish' then return 'Retail product removed from the public display';end if;
  return case when coalesce(v_showcase_enabled,false)
   then 'Live retail display enabled; checkout remains unavailable'
   else 'Retail display preference saved; public showcase is not enabled yet' end;
 end if;
 return case when p_action='publish'
  then 'Publication preference saved; restricted public release is still disabled'
  else 'Product removed from requested-publication list' end;
end $$;
revoke all on function public.set_supplier_listing_intent(uuid,uuid,text) from public;
grant execute on function public.set_supplier_listing_intent(uuid,uuid,text) to authenticated;

-- This public read returns only the same nine safe fields already parsed by
-- the client. It cannot leak costs, image paths, supplier identity, or orders.
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
  'availability',eligible.availability,'can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result
 from (
  select p.id,p.name,p.description,p.price_cents,
   c.id as category_id,c.name as category_name,
   case when i.quantity_on_hand>i.quantity_reserved then 'in_stock'
    else 'sold_out' end as availability
  from public.products p
  join public.stores s on s.id=p.store_id and s.is_public=false
  join public.categories c on c.id=p.category_id and c.store_id=p.store_id
   and c.slug in ('sample-apparel','sample-accessories')
  join public.supplier_listing_controls lc on
   lc.store_id=p.store_id and lc.product_id=p.id
   and lc.supplier_wants_listing=true and lc.admin_gate='clear'
   and (not lc.republish_approval_required or lc.republish_approved)
  join public.inventory_items i on i.store_id=p.store_id
   and i.product_id=p.id and i.quantity_on_hand>=0
   and i.quantity_reserved between 0 and i.quantity_on_hand
  where p.archived_at is null and p.is_published=false and p.is_active=true
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
revoke all on function public.get_public_retail_showcase_catalog(integer,integer) from public;
grant execute on function public.get_public_retail_showcase_catalog(integer,integer) to anon,authenticated;

commit;
