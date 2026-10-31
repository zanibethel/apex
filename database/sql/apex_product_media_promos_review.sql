-- Apex private product media, draft availability, and supplier promotion definitions.
-- Does not publish storefronts, enable checkout or apply Bitcoin payouts.
begin;
alter table public.products
  add column is_active boolean not null default false,
  add column compare_at_price_cents bigint,
  add column image_path text;

alter table public.products
  add constraint products_compare_at_more_than_price
    check (compare_at_price_cents is null or
      (compare_at_price_cents > price_cents and compare_at_price_cents <= 999999999)),
  add constraint products_private_image_path
    check (image_path is null or
      (char_length(image_path) <= 180 and
       image_path ~ ('^' || store_id::text || '/' || id::text ||
         '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$')));

grant insert (compare_at_price_cents, is_active) on public.products to authenticated;
grant update (description, compare_at_price_cents, is_active, image_path)
  on public.products to authenticated;

-- Existing product update RLS is restricted to private, unpublished records,
-- authorized members and immutable store_id/is_published (column grants).
-- is_active means internal merchandising status; it does NOT publish a product.

create table public.supplier_discount_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  discount_kind text not null check (discount_kind in ('percentage','fixed')),
  discount_value integer not null check (discount_value > 0 and discount_value <= 999999999),
  min_subtotal_cents bigint not null default 0 check (min_subtotal_cents between 0 and 999999999),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit between 1 and 1000000),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  is_active boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,code),
  constraint discount_kind_range check (
    (discount_kind='percentage' and discount_value between 1 and 95)
    or (discount_kind='fixed' and discount_value between 1 and 999999999)
  ),
  constraint discount_valid_window check (
    ends_at is null or starts_at is null or ends_at > starts_at
  )
);
alter table public.supplier_discount_codes enable row level security;
revoke all on public.supplier_discount_codes from anon, authenticated;
grant select, insert (store_id,code,discount_kind,discount_value,min_subtotal_cents,
  starts_at,ends_at,usage_limit,is_active,created_by)
 on public.supplier_discount_codes to authenticated;
grant update (discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,
  usage_limit,is_active,updated_at)
 on public.supplier_discount_codes to authenticated;

create policy "supplier_discount_member_read" on public.supplier_discount_codes
 for select to authenticated using (
  exists (
   select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=supplier_discount_codes.store_id
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 );
create policy "supplier_discount_member_insert" on public.supplier_discount_codes
 for insert to authenticated with check (
  created_by=(select auth.uid()) and redemption_count=0
   and exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_discount_codes.store_id and s.is_public=false
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
 );
create policy "supplier_discount_member_update" on public.supplier_discount_codes
 for update to authenticated using (
   exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_discount_codes.store_id and s.is_public=false
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
 ) with check (
   exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_discount_codes.store_id and s.is_public=false
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
 );

create table public.supplier_discount_audit (
  id bigint generated always as identity primary key,
  discount_id uuid not null references public.supplier_discount_codes(id),
  store_id uuid not null references public.stores(id),
  actor_id uuid,
  operation text not null check(operation in ('INSERT','UPDATE')),
  old_value jsonb,
  new_value jsonb not null,
  changed_at timestamptz not null default now()
);
alter table public.supplier_discount_audit enable row level security;
revoke all on public.supplier_discount_audit from anon,authenticated;
grant select on public.supplier_discount_audit to authenticated;
create policy "supplier_discount_audit_read" on public.supplier_discount_audit
 for select to authenticated using (
   exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_discount_audit.store_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
 );

create or replace function apex_internal.audit_supplier_discount()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $fn$
begin
 insert into public.supplier_discount_audit(discount_id,store_id,actor_id,operation,old_value,new_value)
 values (new.id,new.store_id,auth.uid(),tg_op,
   case when tg_op='UPDATE' then to_jsonb(old) else null end,
   to_jsonb(new));
 return new;
end $fn$;
revoke all on function apex_internal.audit_supplier_discount() from public,anon,authenticated;
create trigger apex_discount_audit_trigger
 after insert or update on public.supplier_discount_codes
 for each row execute function apex_internal.audit_supplier_discount();
commit;
