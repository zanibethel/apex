-- Private, per-product stock-count preference only.
-- NOT a public availability override, no sale rights, no checkout change.
begin;

create table public.supplier_private_stock_preferences (
 store_id uuid not null references public.stores(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete cascade,
 track_quantities boolean not null default true,
 changed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 changed_at timestamptz not null default now(),
 primary key (store_id,product_id)
);

create index supplier_private_stock_preferences_product
 on public.supplier_private_stock_preferences(product_id);

alter table public.supplier_private_stock_preferences enable row level security;
alter table public.supplier_private_stock_preferences force row level security;
revoke all on public.supplier_private_stock_preferences from PUBLIC,anon,authenticated;
grant select on public.supplier_private_stock_preferences to authenticated;
grant insert (store_id,product_id,track_quantities)
 on public.supplier_private_stock_preferences to authenticated;
grant update (track_quantities)
 on public.supplier_private_stock_preferences to authenticated;

-- The supplier cannot forge store assignments, operate on published products,
-- or change another supplier's preference.
create policy supplier_private_stock_preferences_read
 on public.supplier_private_stock_preferences
 for select to authenticated using (
  exists (
   select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.id=supplier_private_stock_preferences.product_id
    and p.store_id=supplier_private_stock_preferences.store_id
    and p.is_published=false and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 );

create policy supplier_private_stock_preferences_insert
 on public.supplier_private_stock_preferences
 for insert to authenticated with check (
  changed_by=(select auth.uid()) and
  exists (
   select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.id=supplier_private_stock_preferences.product_id
    and p.store_id=supplier_private_stock_preferences.store_id
    and p.is_published=false and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 );

create policy supplier_private_stock_preferences_update
 on public.supplier_private_stock_preferences
 for update to authenticated
 using (
  exists (
   select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.id=supplier_private_stock_preferences.product_id
    and p.store_id=supplier_private_stock_preferences.store_id
    and p.is_published=false and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 )
 with check (
  exists (
   select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where p.id=supplier_private_stock_preferences.product_id
    and p.store_id=supplier_private_stock_preferences.store_id
    and p.is_published=false and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 );

comment on table public.supplier_private_stock_preferences is
 'Private supplier UI preference for entering stock quantities. Does not change inventory items, reservations, stock-based public release conditions, or checkout.';

commit;