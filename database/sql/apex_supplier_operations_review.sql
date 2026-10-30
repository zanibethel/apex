-- Review-only staging SQL. Never activates commerce, payout, or live wallet destinations.
-- Keep all related app writes gated behind explicit server flags.
begin;

-- Existing draft-only product and category writes. No permission to publish/change store ownership.
grant insert (store_id, sku, name, description, price_cents, currency, category_id)
  on public.products to authenticated;
grant update (name, description, price_cents, category_id)
  on public.products to authenticated;
grant insert (store_id, slug, name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;
grant insert (store_id, product_id, quantity_on_hand) on public.inventory_items to authenticated;
grant update (quantity_on_hand) on public.inventory_items to authenticated;

create policy "supplier_draft_products_insert" on public.products
for insert to authenticated with check (
  is_published = false and exists (
    select 1 from public.stores s join public.supplier_memberships sm
      on sm.supplier_id=s.supplier_id
    where s.id=products.store_id and s.is_public=false
      and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
  )
);
create policy "supplier_draft_products_update" on public.products
for update to authenticated
using (is_published=false and exists (
  select 1 from public.stores s join public.supplier_memberships sm
    on sm.supplier_id=s.supplier_id
  where s.id=products.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
))
with check (is_published=false and exists (
  select 1 from public.stores s join public.supplier_memberships sm
    on sm.supplier_id=s.supplier_id
  where s.id=products.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
));

create policy "supplier_draft_categories_insert" on public.categories
for insert to authenticated with check (
 is_published=false and exists (
   select 1 from public.stores s join public.supplier_memberships sm
    on s.supplier_id=sm.supplier_id
   where s.id=categories.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
 )
);
create policy "supplier_draft_categories_update" on public.categories
for update to authenticated using (is_published=false and exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=categories.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
))
with check (is_published=false and exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=categories.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
));

create policy "supplier_inventory_insert" on public.inventory_items
for insert to authenticated with check (
 quantity_on_hand >= quantity_reserved and exists (
  select 1 from public.stores s join public.supplier_memberships sm
   on s.supplier_id=sm.supplier_id
  where s.id=inventory_items.store_id and s.is_public=false
   and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
 )
);
create policy "supplier_inventory_update" on public.inventory_items
for update to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=inventory_items.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
))
with check (quantity_on_hand >= quantity_reserved and exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=inventory_items.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
));

-- Append-only audit records maintained by non-exposed, locked-down trigger code.
create schema if not exists apex_internal;
revoke all on schema apex_internal from public, anon, authenticated;
create table if not exists public.supplier_catalog_audit (
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id),
 actor_id uuid,
 entity_type text not null check (entity_type in ('products','categories','inventory_items')),
 entity_id text not null,
 operation text not null check (operation in ('INSERT','UPDATE')),
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default now()
);
alter table public.supplier_catalog_audit enable row level security;
revoke all on public.supplier_catalog_audit from anon, authenticated;
grant select on public.supplier_catalog_audit to authenticated;
create policy "supplier_catalog_audit_read" on public.supplier_catalog_audit
 for select to authenticated using (exists (
  select 1 from public.stores s join public.supplier_memberships sm
    on s.supplier_id=sm.supplier_id
  where s.id=supplier_catalog_audit.store_id and sm.user_id=(select auth.uid())
 ));
create or replace function apex_internal.capture_catalog_audit()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $audit$
declare v_store uuid; v_entity_id text;
begin
  v_store := new.store_id;
  if tg_table_name='inventory_items' then
    v_entity_id := new.product_id::text;
  else
    v_entity_id := new.id::text;
  end if;
  insert into public.supplier_catalog_audit
     (store_id,actor_id,entity_type,entity_id,operation,before_state,after_state)
   values (v_store,auth.uid(),tg_table_name,v_entity_id,tg_op,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end
$audit$;
revoke all on function apex_internal.capture_catalog_audit() from public, anon, authenticated;
create trigger apex_product_audit after insert or update on public.products
 for each row execute function apex_internal.capture_catalog_audit();
create trigger apex_category_audit after insert or update on public.categories
 for each row execute function apex_internal.capture_catalog_audit();
create trigger apex_inventory_audit after insert or update on public.inventory_items
 for each row execute function apex_internal.capture_catalog_audit();

-- Verified sales history only. No supplier writes or mock transactions.
create table if not exists public.supplier_sales_history (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 order_reference text not null,
 sale_state text not null check (sale_state in ('pending','confirmed','refunded','cancelled')),
 gross_cents bigint not null check(gross_cents >= 0),
 currency text not null default 'USD' check(currency='USD'),
 confirmed_btc_sats bigint check(confirmed_btc_sats >= 0),
 occurred_at timestamptz not null,
 unique(store_id,order_reference)
);
alter table public.supplier_sales_history enable row level security;
revoke all on public.supplier_sales_history from anon, authenticated;
grant select on public.supplier_sales_history to authenticated;
create policy "supplier_sales_history_read" on public.supplier_sales_history
for select to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
   on s.supplier_id=sm.supplier_id
 where s.id=supplier_sales_history.store_id and sm.user_id=(select auth.uid())
));

-- Test-network destination requests only. No key custody or real payout activation.
create table if not exists public.supplier_wallet_requests (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 label text not null check(char_length(trim(label)) between 1 and 80),
 address text not null check(char_length(address) between 20 and 110),
 network text not null default 'signet' check(network='signet'),
 request_state text not null default 'pending' check(request_state in ('pending','rejected')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.supplier_wallet_requests enable row level security;
revoke all on public.supplier_wallet_requests from anon, authenticated;
grant select on public.supplier_wallet_requests to authenticated;
grant insert(store_id,label,address,created_by) on public.supplier_wallet_requests to authenticated;
create policy "wallet_request_supplier_read" on public.supplier_wallet_requests
for select to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
 on s.supplier_id=sm.supplier_id
 where s.id=supplier_wallet_requests.store_id and sm.user_id=(select auth.uid())
));
create policy "wallet_request_supplier_insert" on public.supplier_wallet_requests
for insert to authenticated with check (
 network='signet' and request_state='pending'
 and created_by=(select auth.uid()) and exists (
  select 1 from public.stores s join public.supplier_memberships sm
   on s.supplier_id=sm.supplier_id
  where s.id=supplier_wallet_requests.store_id and s.is_public=false
   and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
 )
);

-- Admins can view stores without becoming supplier members; protected by trusted app role.
create policy "platform_admin_store_read" on public.stores
for select to authenticated using ((select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');

-- Admin percentage proposals cannot affect payment execution (no payment processor reads this table).
create table if not exists public.store_split_drafts (
 store_id uuid primary key references public.stores(id),
 supplier_percent smallint not null default 90 check(supplier_percent between 0 and 100),
 edited_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.store_split_drafts enable row level security;
revoke all on public.store_split_drafts from anon, authenticated;
grant select,insert(store_id,supplier_percent,edited_by),update(supplier_percent,edited_by,updated_at)
  on public.store_split_drafts to authenticated;
create policy "admin_split_draft_select" on public.store_split_drafts
for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
);
create policy "admin_split_draft_insert" on public.store_split_drafts
for insert to authenticated with check (
 edited_by=(select auth.uid())
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
);
create policy "admin_split_draft_update" on public.store_split_drafts
for update to authenticated
 using ((select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin')
 with check (edited_by=(select auth.uid())
  and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');

create table if not exists public.store_split_draft_audit (
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id),
 actor_id uuid,
 prior_percent smallint,
 next_percent smallint not null,
 changed_at timestamptz not null default now()
);
alter table public.store_split_draft_audit enable row level security;
revoke all on public.store_split_draft_audit from anon, authenticated;
grant select on public.store_split_draft_audit to authenticated;
create policy "admin_split_draft_audit_read" on public.store_split_draft_audit
for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
);
create or replace function apex_internal.record_split_draft()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $audit$
begin
 insert into public.store_split_draft_audit (store_id,actor_id,prior_percent,next_percent)
 values(new.store_id,auth.uid(),
 case when tg_op='UPDATE' then old.supplier_percent else null end,
 new.supplier_percent);
 return new;
end
$audit$;
revoke all on function apex_internal.record_split_draft() from public,anon,authenticated;
create trigger apex_split_draft_audit after insert or update on public.store_split_drafts
 for each row execute function apex_internal.record_split_draft();
commit;
