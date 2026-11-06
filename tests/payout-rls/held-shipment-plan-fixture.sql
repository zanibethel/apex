-- Synthetic fixtures for disposable PostgreSQL only. Shared by the RLS and race tests.
begin;
do $guard$
begin
 if current_database() <> 'apex_test'
  or not exists (select 1 from public.products where sku = 'SYNTH-RELEASE-1')
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Shipment plan fixture requires the disposable payout test database'; end if;
end $guard$;

insert into auth.users (id, email_confirmed_at) values
 ('a2153000-0000-4000-8000-000000000001', now()), -- staff
 ('a2153000-0000-4000-8000-000000000002', now()), -- other supplier
 ('a2153000-0000-4000-8000-000000000003', now()), -- manager
 ('a2153000-0000-4000-8000-000000000004', null); -- unconfirmed owner
insert into public.suppliers (id, slug, display_name)
 values ('a2155000-0000-4000-8000-000000000001', 'shipment-fixture-supplier', 'Other synthetic supplier');
insert into public.stores (id, supplier_id, slug, display_name) values
 ('a2154000-0000-4000-8000-000000000001', 'a2155000-0000-4000-8000-000000000001', 'shipment-fixture-other', 'Other synthetic store'),
 ('a2154000-0000-4000-8000-000000000002', '61000000-0000-0000-0000-000000000001', 'shipment-fixture-sibling', 'Second synthetic store');
insert into public.supplier_memberships (supplier_id, user_id, role) values
 ('61000000-0000-0000-0000-000000000001', 'a2153000-0000-4000-8000-000000000001', 'staff'),
 ('a2155000-0000-4000-8000-000000000001', 'a2153000-0000-4000-8000-000000000002', 'owner'),
 ('61000000-0000-0000-0000-000000000001', 'a2153000-0000-4000-8000-000000000003', 'manager'),
 ('61000000-0000-0000-0000-000000000001', 'a2153000-0000-4000-8000-000000000004', 'owner');
insert into public.products (id, store_id, sku, name, price_cents)
 values ('a2156000-0000-4000-8000-000000000001', 'a2154000-0000-4000-8000-000000000001',
 'SYNTH-PLAN-OTHER', 'Other synthetic item', 100);

insert into public.supplier_sales_history (id, store_id, order_reference, sale_state, gross_cents, occurred_at)
select format('a2151000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
 (case when n = 6 then 'a2154000-0000-4000-8000-000000000001' else '62000000-0000-0000-0000-000000000001' end)::uuid,
 'SYNTH-PLAN-' || n, 'confirmed', case when n = 1 then 700 else 100 end, '2026-11-06 18:00:00+00'::timestamptz
from generate_series(1, 7) n;
insert into apex_internal.order_detail_snapshots
 (id, store_id, sale_id, source_order_reference, original_purchased_at, source_payment_state, source_gross_cents, source_event_sha256)
select replace(id::text, 'a2151000', 'a2150000')::uuid, store_id, id, order_reference,
 occurred_at, sale_state, gross_cents, repeat('c', 64)
from public.supplier_sales_history where order_reference like 'SYNTH-PLAN-%';
insert into apex_internal.order_line_snapshots
 (id, order_id, store_id, source_line_reference, line_number, product_id, sku_at_purchase,
  title_at_purchase, quantity, unit_price_cents, source_line_sha256)
select replace(h.id::text, 'a2150000', 'a2152000')::uuid, h.id, h.store_id, 'original-line', 1,
 (case when h.store_id = 'a2154000-0000-4000-8000-000000000001'
   then 'a2156000-0000-4000-8000-000000000001' else '64000000-0000-0000-0000-000000000001' end)::uuid,
 'SYNTH-PLAN-LINE', 'Synthetic purchased item', case when h.source_order_reference = 'SYNTH-PLAN-1' then 5 else 1 end,
 100, repeat('b', 64)
from apex_internal.order_detail_snapshots h where h.source_order_reference like 'SYNTH-PLAN-%';
insert into apex_internal.order_line_snapshots
 (id, order_id, store_id, source_line_reference, line_number, product_id, sku_at_purchase,
  title_at_purchase, quantity, unit_price_cents, source_line_sha256)
values ('a2152000-0000-4000-8000-000000000101', 'a2150000-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001', 'second-line', 2, '64000000-0000-0000-0000-000000000001',
 'SYNTH-PLAN-LINE-B', 'Second synthetic purchased item', 2, 100, repeat('d', 64));
commit;
