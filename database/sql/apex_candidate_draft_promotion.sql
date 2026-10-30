-- Apex: private, atomic promotion of a reviewed supplier source variant to a draft catalog record.
-- No wholesale cost becomes a retail price; no public publishing or checkout.
begin;

alter table public.supplier_import_candidates
  add constraint supplier_import_candidates_store_id_id_unique unique (store_id,id);

create table public.supplier_candidate_drafts (
  candidate_id uuid primary key,
  store_id uuid not null,
  product_id uuid not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint candidate_draft_source_same_store foreign key (store_id,candidate_id)
    references public.supplier_import_candidates(store_id,id) on delete restrict,
  constraint candidate_draft_product_same_store foreign key (store_id,product_id)
    references public.products(store_id,id) on delete restrict
);
alter table public.supplier_candidate_drafts enable row level security;
revoke all on table public.supplier_candidate_drafts from anon, authenticated;
grant select, insert (candidate_id,store_id,product_id,created_by)
 on public.supplier_candidate_drafts to authenticated;

create policy "supplier_candidate_draft_select" on public.supplier_candidate_drafts
 for select to authenticated using (
   exists (
     select 1 from public.stores s join public.supplier_memberships m
       on m.supplier_id=s.supplier_id
     where s.id=supplier_candidate_drafts.store_id
       and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
 );

create policy "supplier_candidate_draft_insert" on public.supplier_candidate_drafts
 for insert to authenticated with check (
   created_by=(select auth.uid()) and exists (
     select 1 from public.stores s join public.supplier_memberships m
       on m.supplier_id=s.supplier_id
     where s.id=supplier_candidate_drafts.store_id and s.is_public=false
       and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   ) and exists (
     select 1 from public.supplier_import_candidates c
     where c.id=supplier_candidate_drafts.candidate_id
       and c.store_id=supplier_candidate_drafts.store_id
       and c.review_status='approved_for_draft'
   ) and exists (
     select 1 from public.products p
     where p.id=supplier_candidate_drafts.product_id
       and p.store_id=supplier_candidate_drafts.store_id and p.is_published=false
   )
 );

-- SECURITY INVOKER: retains all catalog, membership, and inventory RLS restrictions.
-- Supabase executes a function/RPC call in one database transaction; failure rolls back
-- the product insert, stock insert, and candidate association together.
create function public.create_draft_from_supplier_candidate(
  p_store_id uuid,
  p_candidate_id uuid,
  p_sku text,
  p_retail_price_cents bigint,
  p_quantity_on_hand integer,
  p_description text default '',
  p_category_id uuid default null
) returns uuid
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare
  v_candidate record;
  v_name text;
  v_product_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required' using errcode='42501';
  end if;

  if p_store_id is null or p_candidate_id is null
    or p_sku is null or char_length(btrim(p_sku)) not between 1 and 60
    or p_retail_price_cents is null or p_retail_price_cents not between 1 and 999999999
    or p_quantity_on_hand is null or p_quantity_on_hand not between 0 and 1000000
    or p_description is null or char_length(p_description) > 1500
  then
    raise exception 'Invalid draft product details' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.stores s join public.supplier_memberships m
      on m.supplier_id=s.supplier_id
    where s.id=p_store_id and s.is_public=false
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  ) then
    raise exception 'Supplier access required' using errcode='42501';
  end if;

  select product_name,strength,review_status into v_candidate
    from public.supplier_import_candidates
    where store_id=p_store_id and id=p_candidate_id
      and review_status='approved_for_draft';

  if not found then
    raise exception 'Source variant must be reviewed first' using errcode='22023';
  end if;

  v_name := v_candidate.product_name || ' — ' || v_candidate.strength;
  if char_length(v_name)>120 then
    raise exception 'Source variant name is too long for a product record' using errcode='22023';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c
      where c.id=p_category_id and c.store_id=p_store_id
  ) then
    raise exception 'Category must belong to the same storefront' using errcode='22023';
  end if;

  -- Never reads/copies wholesale_cost_cents or any unverified stock estimate.
  insert into public.products
    (store_id,sku,name,description,price_cents,currency,category_id)
  values (p_store_id,btrim(p_sku),v_name,p_description,p_retail_price_cents,'USD',p_category_id)
  returning id into v_product_id;

  insert into public.inventory_items
    (store_id,product_id,quantity_on_hand)
  values (p_store_id,v_product_id,p_quantity_on_hand);

  insert into public.supplier_candidate_drafts
    (candidate_id,store_id,product_id,created_by)
  values (p_candidate_id,p_store_id,v_product_id,auth.uid());

  return v_product_id;
end
$fn$;
revoke all on function public.create_draft_from_supplier_candidate(uuid,uuid,text,bigint,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.create_draft_from_supplier_candidate(uuid,uuid,text,bigint,integer,text,uuid) to authenticated;
commit;
