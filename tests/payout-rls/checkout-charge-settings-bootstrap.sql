-- PR #193: match current supplier promotion constraints in disposable CI DB.
-- Production has this table already; this fixture is never deployed.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test'
  or to_regclass('public.supplier_discount_codes') is not null
 then raise exception 'Discount checkout fixture only runs in isolated CI';end if;
end $guard$;
create table public.supplier_discount_codes(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 code text not null check(code ~ '^[A-Z0-9_-]{3,24}$'),
 discount_kind text not null
  constraint supplier_discount_codes_discount_kind_check
    check(discount_kind in('percentage','fixed')),
 discount_value integer not null check(discount_value>0 and discount_value<=999999999),
 min_subtotal_cents bigint not null default 0
  check(min_subtotal_cents between 0 and 999999999),
 starts_at timestamptz,
 ends_at timestamptz,
 usage_limit integer,
 redemption_count integer not null default 0,
 is_active boolean not null default false,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint discount_kind_range check(
  (discount_kind='percentage' and discount_value between 1 and 95)
  or (discount_kind='fixed' and discount_value between 1 and 999999999)),
 unique(store_id,code)
);
alter table public.supplier_discount_codes enable row level security;
revoke all on public.supplier_discount_codes from public,anon,authenticated;
select 'private_supplier_discount_fixture_ready';
