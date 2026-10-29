-- Apex catalog foundation / REVIEW-ONLY source SQL.
-- NOT APPLIED. Run only against a new, explicitly approved Apex Supabase project.
-- No payments, live checkout, supplier secrets, customer data, or product seeds.
-- All exposed tables have RLS; no application writes enabled in phase 1.
begin;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(btrim(slug)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  slug text not null unique check (length(btrim(slug)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, supplier_id)
);

-- Only a trusted administrator provisions memberships; never allow self-assigned roles.
create table public.supplier_memberships (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (supplier_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  slug text not null check (length(btrim(slug)) > 0),
  name text not null check (length(btrim(name)) > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, slug),
  unique (store_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  category_id uuid,
  sku text not null check (length(btrim(sku)) > 0),
  name text not null check (length(btrim(name)) > 0),
  description text,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (store_id, id),
  constraint products_category_same_store foreign key (store_id, category_id)
    references public.categories(store_id, id) on delete restrict
);

-- Stock information is private, even for published products.
create table public.inventory_items (
  store_id uuid not null,
  product_id uuid not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id),
  check (quantity_reserved <= quantity_on_hand),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade
);

create index supplier_memberships_user_supplier_idx
  on public.supplier_memberships(user_id, supplier_id);
create index stores_supplier_idx on public.stores(supplier_id);
create index categories_published_store_idx on public.categories(store_id, name)
  where is_published;
create index products_published_store_idx on public.products(store_id, name)
  where is_published;
create index products_category_idx on public.products(store_id, category_id);

alter table public.suppliers enable row level security;
alter table public.stores enable row level security;
alter table public.supplier_memberships enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_items enable row level security;

-- Data API privileges are deliberately SELECT-only; mutations require a future,
-- audited authorization design, not merely an authenticated session.
revoke all on public.suppliers, public.stores, public.supplier_memberships,
  public.categories, public.products, public.inventory_items from anon, authenticated;
grant select on public.suppliers, public.stores, public.supplier_memberships,
  public.categories, public.products, public.inventory_items to authenticated;
grant select on public.stores, public.categories, public.products to anon;

create policy "membership_self_read"
on public.supplier_memberships for select to authenticated
using (user_id = (select auth.uid()));

create policy "supplier_member_read"
on public.suppliers for select to authenticated
using (
  exists (
    select 1 from public.supplier_memberships sm
    where sm.supplier_id = suppliers.id and sm.user_id = (select auth.uid())
  )
);

create policy "public_store_read"
on public.stores for select to anon, authenticated using (is_public);
create policy "member_store_read"
on public.stores for select to authenticated
using (
  exists (
    select 1 from public.supplier_memberships sm
    where sm.supplier_id = stores.supplier_id and sm.user_id = (select auth.uid())
  )
);

create policy "public_category_read"
on public.categories for select to anon, authenticated
using (
  is_published and exists (
    select 1 from public.stores s
    where s.id = categories.store_id and s.is_public
  )
);
create policy "member_category_read"
on public.categories for select to authenticated
using (
  exists (
    select 1 from public.stores s
    join public.supplier_memberships sm on sm.supplier_id = s.supplier_id
    where s.id = categories.store_id and sm.user_id = (select auth.uid())
  )
);

create policy "public_product_read"
on public.products for select to anon, authenticated
using (
  is_published and exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.is_public
  ) and (
    category_id is null or exists (
      select 1 from public.categories c
      where c.id = products.category_id
        and c.store_id = products.store_id
        and c.is_published
    )
  )
);
create policy "member_product_read"
on public.products for select to authenticated
using (
  exists (
    select 1 from public.stores s
    join public.supplier_memberships sm on sm.supplier_id = s.supplier_id
    where s.id = products.store_id and sm.user_id = (select auth.uid())
  )
);

create policy "member_inventory_read"
on public.inventory_items for select to authenticated
using (
  exists (
    select 1 from public.stores s
    join public.supplier_memberships sm on sm.supplier_id = s.supplier_id
    where s.id = inventory_items.store_id and sm.user_id = (select auth.uid())
  )
);

-- No INSERT, UPDATE, DELETE policies; no domain or wallet or real product data.
commit;
