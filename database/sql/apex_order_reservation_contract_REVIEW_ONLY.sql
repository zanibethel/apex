-- PR #191: DISPOSABLE POSTGRES ONLY, not a production migration.
-- Exercises a generic held reservation transaction using synthetic fixtures.
-- NEVER grant access to Apex customer/supplier roles or touch public products.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test'
 then raise exception 'Reservation contract fixture is forbidden outside disposable apex_test';end if;
 if to_regclass('apex_internal.checkout_order_intents') is null
 then raise exception 'Expected prior immutable private journal fixture missing';end if;
end $guard$;
create schema apex_test_reservation;
revoke all on schema apex_test_reservation from public,anon,authenticated;

create table apex_test_reservation.inventory(
 store_id uuid not null,
 product_id uuid not null,
 price_cents bigint not null check(price_cents between 1 and 999999999),
 currency text not null default 'USD' check(currency='USD'),
 on_hand integer not null check(on_hand>=0),
 reserved integer not null default 0 check(reserved>=0 and reserved<=on_hand),
 eligible boolean not null default false,
 primary key(store_id,product_id)
);
create table apex_test_reservation.shipping_quotes(
 quote_ref text primary key,
 store_id uuid not null,
 cart_fingerprint text not null check(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 destination_region text not null check(destination_region ~ '^[A-Z]{2}$'),
 amount_cents bigint not null check(amount_cents between 0 and 999999999),
 currency text not null default 'USD' check(currency='USD'),
 approved boolean not null default false,
 expires_at timestamptz not null
);
create table apex_test_reservation.tax_quotes(
 quote_ref text primary key,
 store_id uuid not null,
 cart_fingerprint text not null check(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 destination_region text not null check(destination_region ~ '^[A-Z]{2}$'),
 amount_cents bigint not null check(amount_cents between 0 and 999999999),
 currency text not null default 'USD' check(currency='USD'),
 approved boolean not null default false,
 expires_at timestamptz not null
);
create table apex_test_reservation.orders(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 idempotency_hash text not null check(idempotency_hash ~ '^[0-9a-f]{64}$'),
 cart_fingerprint text not null check(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 canonical_items jsonb not null,
 shipping_quote_ref text not null,
 tax_quote_ref text not null,
 destination_region text not null,
 merchandise_cents bigint not null check(merchandise_cents>0),
 shipping_cents bigint not null check(shipping_cents>=0),
 tax_cents bigint not null check(tax_cents>=0),
 total_cents bigint not null check(total_cents between 1 and 999999999),
 state text not null default 'held_fixture_only'
  check(state='held_fixture_only'),
 created_at timestamptz not null default now(),
 unique(store_id,idempotency_hash)
);
create table apex_test_reservation.order_lines(
 order_id uuid not null references apex_test_reservation.orders(id),
 product_id uuid not null,
 quantity integer not null check(quantity between 1 and 10),
 captured_unit_cents bigint not null,
 primary key(order_id,product_id)
);
revoke all on all tables in schema apex_test_reservation
 from public,anon,authenticated;

create function apex_test_reservation.reserve_held_contract(
 p_store_id uuid,p_idempotency_hash text,p_items jsonb,
 p_shipping_ref text,p_tax_ref text,p_region text,
 p_expected_total_cents bigint
) returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_row jsonb;
 v_id uuid;
 v_quantity integer;
 v_seen uuid[]:=array[]::uuid[];
 v_canonical jsonb;
 v_cart_fingerprint text;
 v_existing apex_test_reservation.orders%rowtype;
 v_inventory apex_test_reservation.inventory%rowtype;
 v_shipping apex_test_reservation.shipping_quotes%rowtype;
 v_tax apex_test_reservation.tax_quotes%rowtype;
 v_subtotal bigint:=0;
 v_line bigint;
 v_total bigint;
 v_order_id uuid;
 v_units integer:=0;
begin
 if current_database()<>'apex_test' then
  raise exception 'Fixture cannot execute outside disposable database'
   using errcode='42501';end if;
 if p_store_id is null or p_idempotency_hash is null or
   p_idempotency_hash !~ '^[0-9a-f]{64}$' or
   p_items is null or jsonb_typeof(p_items)<>'array' or
   jsonb_array_length(p_items) not between 1 and 8 or
   p_shipping_ref is null or length(p_shipping_ref) not between 3 and 90 or
   p_tax_ref is null or length(p_tax_ref) not between 3 and 90 or
   p_region is null or p_region !~ '^[A-Z]{2}$' or
   p_expected_total_cents is null or
   p_expected_total_cents not between 1 and 999999999
 then raise exception 'Invalid reservation request' using errcode='22023';end if;
 for v_row in select value from jsonb_array_elements(p_items)
 loop
  if jsonb_typeof(v_row)<>'object' or
   (select count(*) from jsonb_object_keys(v_row))<>2 or
   not(v_row ? 'product_id' and v_row ? 'quantity') or
   jsonb_typeof(v_row->'product_id')<>'string' or
   (v_row->>'product_id') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or
   jsonb_typeof(v_row->'quantity')<>'number' or
   (v_row->>'quantity') !~ '^[1-9][0-9]?$'
  then raise exception 'Invalid reservation line' using errcode='22023';end if;
  v_id:=(v_row->>'product_id')::uuid;
  v_quantity:=(v_row->>'quantity')::integer;
  if v_quantity>10 or v_id=any(v_seen)
  then raise exception 'Duplicate product or invalid quantity' using errcode='22023';end if;
  v_seen:=array_append(v_seen,v_id);
  v_units:=v_units+v_quantity;
  if v_units>50 then raise exception 'Reservation item limit' using errcode='22023';end if;
 end loop;

 select jsonb_agg(jsonb_build_object(
   'product_id',(line.value->>'product_id')::uuid,
   'quantity',(line.value->>'quantity')::integer
  ) order by (line.value->>'product_id')::uuid)
 into v_canonical from jsonb_array_elements(p_items) line(value);
 v_cart_fingerprint:=encode(sha256(convert_to(v_canonical::text,'UTF8')),'hex');

 -- Advisory lock serializes same-key retries; unique index is the durable
 -- final line of defence. Hash collisions only cause extra serialization.
 perform pg_advisory_xact_lock(
  hashtextextended(p_store_id::text||':'||p_idempotency_hash,0));
 select * into v_existing from apex_test_reservation.orders o
  where o.store_id=p_store_id and o.idempotency_hash=p_idempotency_hash
  for update;
 if found then
  if v_existing.cart_fingerprint<>v_cart_fingerprint or
   v_existing.shipping_quote_ref<>p_shipping_ref or
   v_existing.tax_quote_ref<>p_tax_ref or
   v_existing.destination_region<>p_region or
   v_existing.total_cents<>p_expected_total_cents or
   v_existing.canonical_items<>v_canonical
  then raise exception 'Idempotency key reused for different request'
    using errcode='23505';end if;
  return jsonb_build_object('state','replayed_held',
   'fixture_only',true,'order_id',v_existing.id,
   'total_cents',v_existing.total_cents::text,
   'can_pay',false,'invoice_created',false);
 end if;

 -- Trusted quotes bind region, cart fingerprint, currency and expiry.
 -- They are looked up by reference, never priced from browser payload.
 select * into v_shipping from apex_test_reservation.shipping_quotes s
  where s.quote_ref=p_shipping_ref and s.store_id=p_store_id
    and s.cart_fingerprint=v_cart_fingerprint
    and s.destination_region=p_region and s.currency='USD'
    and s.approved and s.expires_at>now()
  for share;
 if not found then raise exception 'Shipping quote not verified'
  using errcode='23514';end if;
 select * into v_tax from apex_test_reservation.tax_quotes t
  where t.quote_ref=p_tax_ref and t.store_id=p_store_id
    and t.cart_fingerprint=v_cart_fingerprint
    and t.destination_region=p_region and t.currency='USD'
    and t.approved and t.expires_at>now()
  for share;
 if not found then raise exception 'Tax quote not verified'
  using errcode='23514';end if;
 -- Lock rows consistently across all competing orders.
 for v_row in select value from jsonb_array_elements(v_canonical) line(value)
    order by (line.value->>'product_id')::uuid
 loop
  v_id:=(v_row->>'product_id')::uuid;
  v_quantity:=(v_row->>'quantity')::integer;
  select * into v_inventory from apex_test_reservation.inventory i
   where i.store_id=p_store_id and i.product_id=v_id
   for update;
  if not found or not v_inventory.eligible or v_inventory.currency<>'USD'
   or v_inventory.on_hand-v_inventory.reserved<v_quantity
  then raise exception 'Product unavailable or insufficient stock'
   using errcode='23514';end if;
  v_line:=v_inventory.price_cents*v_quantity;
  if v_subtotal+v_line>999999999
  then raise exception 'Subtotal exceeds limit' using errcode='22023';end if;
  v_subtotal:=v_subtotal+v_line;
 end loop;
 v_total:=v_subtotal+v_shipping.amount_cents+v_tax.amount_cents;
 if v_total>999999999 or v_total<>p_expected_total_cents
 then raise exception 'Server total does not match submitted total'
  using errcode='22023';end if;

 insert into apex_test_reservation.orders(
  store_id,idempotency_hash,cart_fingerprint,canonical_items,
  shipping_quote_ref,tax_quote_ref,destination_region,
  merchandise_cents,shipping_cents,tax_cents,total_cents
 ) values(
  p_store_id,p_idempotency_hash,v_cart_fingerprint,v_canonical,
  p_shipping_ref,p_tax_ref,p_region,v_subtotal,
  v_shipping.amount_cents,v_tax.amount_cents,v_total
 ) returning id into v_order_id;
 for v_row in select value from jsonb_array_elements(v_canonical) line(value)
 loop
  v_id:=(v_row->>'product_id')::uuid;
  v_quantity:=(v_row->>'quantity')::integer;
  insert into apex_test_reservation.order_lines(
   order_id,product_id,quantity,captured_unit_cents)
   select v_order_id,v_id,v_quantity,price_cents
   from apex_test_reservation.inventory
   where store_id=p_store_id and product_id=v_id;
  update apex_test_reservation.inventory set reserved=reserved+v_quantity
   where store_id=p_store_id and product_id=v_id
    and on_hand-reserved>=v_quantity;
  if not found then raise exception 'Reservation conflict' using errcode='23514';end if;
 end loop;
 return jsonb_build_object('state','held_fixture_only',
   'fixture_only',true,'order_id',v_order_id,
   'total_cents',v_total::text,'can_pay',false,'invoice_created',false);
end $fn$;
revoke all on function apex_test_reservation.reserve_held_contract(
 uuid,text,jsonb,text,text,text,bigint)
 from public,anon,authenticated;

-- All records are synthetic and live exclusively in the isolated schema.
insert into apex_test_reservation.inventory
(store_id,product_id,price_cents,on_hand,reserved,eligible)
values
('77000000-0000-0000-0000-000000000001',
 '78000000-0000-0000-0000-000000000001',2500,5,0,true),
('77000000-0000-0000-0000-000000000001',
 '78000000-0000-0000-0000-000000000002',4000,1,0,true),
('77000000-0000-0000-0000-000000000001',
 '78000000-0000-0000-0000-000000000003',1000,2,0,false);

with quote_seed as (
 select '77000000-0000-0000-0000-000000000001'::uuid store_id,
  encode(sha256(convert_to(
   '[{"product_id": "78000000-0000-0000-0000-000000000001", "quantity": 2}]',
   'UTF8')),'hex') cart_hash
)
insert into apex_test_reservation.shipping_quotes(
 quote_ref,store_id,cart_fingerprint,destination_region,
 amount_cents,approved,expires_at)
 select 'ship-demo-1',store_id,cart_hash,'TX',700,true,now()+interval '1 hour'
 from quote_seed;
with quote_seed as (
 select '77000000-0000-0000-0000-000000000001'::uuid store_id,
  encode(sha256(convert_to(
   '[{"product_id": "78000000-0000-0000-0000-000000000001", "quantity": 2}]',
   'UTF8')),'hex') cart_hash
)
insert into apex_test_reservation.tax_quotes(
 quote_ref,store_id,cart_fingerprint,destination_region,
 amount_cents,approved,expires_at)
 select 'tax-demo-1',store_id,cart_hash,'TX',350,true,now()+interval '1 hour'
 from quote_seed;
with quote_seed as (
 select '77000000-0000-0000-0000-000000000001'::uuid store_id,
  encode(sha256(convert_to(
   '[{"product_id": "78000000-0000-0000-0000-000000000002", "quantity": 1}]',
   'UTF8')),'hex') cart_hash
)
insert into apex_test_reservation.shipping_quotes(
 quote_ref,store_id,cart_fingerprint,destination_region,
 amount_cents,approved,expires_at)
 select 'ship-race-1',store_id,cart_hash,'TX',500,true,now()+interval '1 hour'
 from quote_seed;
with quote_seed as (
 select '77000000-0000-0000-0000-000000000001'::uuid store_id,
  encode(sha256(convert_to(
   '[{"product_id": "78000000-0000-0000-0000-000000000002", "quantity": 1}]',
   'UTF8')),'hex') cart_hash
)
insert into apex_test_reservation.tax_quotes(
 quote_ref,store_id,cart_fingerprint,destination_region,
 amount_cents,approved,expires_at)
 select 'tax-race-1',store_id,cart_hash,'TX',250,true,now()+interval '1 hour'
 from quote_seed;
select 'reservation_fixture_ready';
