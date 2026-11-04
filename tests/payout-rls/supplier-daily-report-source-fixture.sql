-- Synthetic supplier sales-history source for isolated CI only.
-- Production already has this table and MUST NOT use this fixture.
do $guard$
begin
 if current_database()<>'apex_test'
  or to_regclass('public.supplier_sales_history') is not null
 then raise exception 'Supplier report fixture may only run in disposable CI';end if;
end $guard$;
create table public.supplier_sales_history(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 order_reference text not null check(length(btrim(order_reference))>0),
 sale_state text not null check(sale_state in ('pending','confirmed','refunded','cancelled')),
 gross_cents bigint not null check(gross_cents>=0),
 currency text not null default 'USD' check(currency='USD'),
 confirmed_btc_sats bigint check(confirmed_btc_sats>=0),
 occurred_at timestamptz not null default now(),
 unique(store_id,order_reference)
);
alter table public.supplier_sales_history enable row level security;
grant select on public.supplier_sales_history to authenticated;
create policy supplier_sales_history_read on public.supplier_sales_history
 for select to authenticated using (
  exists(select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=supplier_sales_history.store_id and m.user_id=(select auth.uid()))
 );
