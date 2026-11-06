-- Private, read-only supplier option staging.
-- Contains supplier-provided RETAIL proposals, never wholesale/source cost.
-- Does not change products, public catalog, checkout, stock, shipping or gates.
begin;

create table if not exists public.apex_supplier_variant_review_items (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 source_batch text not null check (length(source_batch) between 3 and 80),
 source_row integer not null check (source_row between 2 and 1000000),
 parent_title text not null check (length(btrim(parent_title)) between 1 and 120),
 source_name text not null check (length(btrim(source_name)) between 1 and 120),
 source_section text not null check (length(source_section) <= 80),
 strength text not null default '' check (length(strength) <= 120),
 size text not null default '' check (length(size) <= 60),
 carrier_oil text not null default '' check (carrier_oil in ('','MCT','GSO')),
 retail_price_cents bigint check (retail_price_cents between 1 and 999999999),
 review_status text not null check (review_status in ('pending_review','needs_clarification')),
 review_note text not null default '' check (length(review_note) <= 500),
 inserted_at timestamptz not null default now(),
 unique (store_id,source_batch,source_row,strength,size,carrier_oil),
 check (review_status <> 'pending_review' or retail_price_cents is not null)
);

create index if not exists apex_supplier_variant_review_page
 on public.apex_supplier_variant_review_items (store_id,source_batch,parent_title,source_row);

alter table public.apex_supplier_variant_review_items enable row level security;
alter table public.apex_supplier_variant_review_items force row level security;
revoke all on public.apex_supplier_variant_review_items from PUBLIC,anon,authenticated;
-- Explicit select grant matters after the October 2026 Data API exposure change.
grant select on public.apex_supplier_variant_review_items to authenticated;

create policy apex_supplier_variant_review_owner_manager_read
 on public.apex_supplier_variant_review_items for select to authenticated
 using (
  exists (
   select 1 from public.stores s
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where s.id=apex_supplier_variant_review_items.store_id
    and s.is_public=false
    and sm.user_id=(select auth.uid())
    and sm.role in ('owner','manager')
  )
 );

comment on table public.apex_supplier_variant_review_items is
 'Supplier-only, read-only review of private retail option proposals. No public sales, SKU assignment, verified stock or authorization. Trusted SQL import only.';

commit;
