-- Issue #214 (phase 1): private verified-source order detail foundation.
-- This is not a customer checkout API, shipping workflow, inventory reserve,
-- payment processor, legal eligibility decision, or provider webhook.
-- No client writer exists. Data can only be created by a later audited,
-- privileged ingestion controller after separate authorization.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.supplier_sales_history') is null
  or to_regclass('public.products') is null
  or to_regclass('public.stores') is null
  or to_regclass('public.supplier_memberships') is null
  or to_regclass('apex_internal.checkout_order_intents') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or has_schema_privilege('authenticated','apex_internal','USAGE')
  or has_schema_privilege('anon','apex_internal','USAGE')
 then raise exception 'Private order detail preflight denied';end if;
end $preflight$;

-- One stable order ID per real, previously recorded sale. The matching source
-- check below prevents a fabricated source reference, purchased-at time,
-- price or payment state. This snapshot still grants NO fulfillment rights.
create table apex_internal.order_detail_snapshots (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 sale_id uuid not null references public.supplier_sales_history(id) on delete restrict,
 source_order_reference text not null
  check(length(btrim(source_order_reference)) between 1 and 200),
 original_purchased_at timestamptz not null,
 source_payment_state text not null
  check(source_payment_state in ('pending','confirmed','refunded','cancelled')),
 source_gross_cents bigint not null check(source_gross_cents>=0),
 currency text not null default 'USD' check(currency='USD'),
 source_event_sha256 text not null
  check(source_event_sha256 ~ '^[0-9a-f]{64}$'),
 record_status text not null default 'held_unverified'
  check(record_status='held_unverified'),
 fulfillment_authorized boolean not null default false
  check(fulfillment_authorized=false),
 payment_authorized boolean not null default false
  check(payment_authorized=false),
 created_at timestamptz not null default now(),
 unique(store_id,sale_id),
 unique(store_id,source_order_reference),
 unique(id,store_id)
);
comment on table apex_internal.order_detail_snapshots is
 'Immutable snapshot of a previously recorded sale: never a new paid order, legal eligibility, checkout or shipping permission. Event hash is a replay key, not independent proof of source authenticity.';
create index apex_order_details_store_time_idx
 on apex_internal.order_detail_snapshots(store_id,original_purchased_at desc);

-- Snapshot identities must agree with the trusted recorded sale. The sale may
-- later change payment state, but the original snapshot cannot be rewritten;
-- future observations belong in a separate append-only ledger.
create function apex_internal.validate_order_detail_sale_source()
 returns trigger language plpgsql security invoker
 set search_path=pg_catalog as $fn$
declare v_sale public.supplier_sales_history%rowtype;
begin
 select * into v_sale from public.supplier_sales_history
 where id=new.sale_id for key share;
 if not found
  or v_sale.store_id is distinct from new.store_id
  or v_sale.order_reference is distinct from new.source_order_reference
  or v_sale.occurred_at is distinct from new.original_purchased_at
  or v_sale.sale_state is distinct from new.source_payment_state
  or v_sale.gross_cents is distinct from new.source_gross_cents
  or v_sale.currency is distinct from new.currency
 then raise exception 'Order details do not match recorded sale'
  using errcode='23514';end if;
 return new;
end $fn$;
revoke all on function apex_internal.validate_order_detail_sale_source()
 from public,anon,authenticated;
create trigger apex_order_details_verify_sale
 before insert on apex_internal.order_detail_snapshots
 for each row execute function apex_internal.validate_order_detail_sale_source();

-- Each line is a purchased-at-time snapshot, not the mutable catalog record.
-- A composite FK prevents a product/line from another supplier store.
create table apex_internal.order_line_snapshots (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 order_id uuid not null,
 source_line_reference text not null
  check(length(btrim(source_line_reference)) between 1 and 140),
 line_number smallint not null check(line_number between 1 and 50),
 product_id uuid not null,
 sku_at_purchase text not null
  check(length(btrim(sku_at_purchase)) between 1 and 160),
 title_at_purchase text not null
  check(length(btrim(title_at_purchase)) between 1 and 240),
 variant_at_purchase text not null default ''
  check(length(variant_at_purchase)<=140),
 quantity integer not null check(quantity between 1 and 100),
 unit_price_cents bigint not null check(unit_price_cents between 0 and 99999999),
 line_subtotal_cents bigint generated always as
  (quantity::bigint * unit_price_cents) stored,
 currency text not null default 'USD' check(currency='USD'),
 source_line_sha256 text not null
  check(source_line_sha256 ~ '^[0-9a-f]{64}$'),
 product_eligibility text not null default 'not_verified'
  check(product_eligibility='not_verified'),
 shipping_authorized boolean not null default false
  check(shipping_authorized=false),
 captured_at timestamptz not null default now(),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id)
  on delete restrict,
 foreign key(store_id,product_id)
  references public.products(store_id,id) on delete restrict,
 unique(order_id,line_number),
 unique(order_id,source_line_reference)
);
comment on table apex_internal.order_line_snapshots is
 'Immutable order-line snapshots. Original SKU/title/unit amount and quantity survive later catalog edits. No inferred item eligibility or shipping privileges.';
create index apex_order_lines_store_order_idx
 on apex_internal.order_line_snapshots(store_id,order_id);

-- Delivery PII MUST be sealed outside PostgreSQL with an application-managed
-- AES-256-GCM key. Never store addresses, plaintext, key material, or customer
-- details here. This schema deliberately cannot decrypt or email delivery data.
-- A future trusted server adapter must validate payload schema, destination
-- eligibility, key rotation, retention and authorized access before use.
create table apex_internal.order_delivery_envelopes (
 order_id uuid primary key,
 store_id uuid not null,
 envelope_format text not null default 'aes-256-gcm-v1'
  check(envelope_format='aes-256-gcm-v1'),
 key_reference text not null
  check(key_reference ~ '^[A-Za-z0-9_-]{5,80}$'),
 nonce bytea not null check(octet_length(nonce)=12),
 ciphertext bytea not null
  check(octet_length(ciphertext) between 16 and 32768),
 auth_tag bytea not null check(octet_length(auth_tag)=16),
 delivery_verified boolean not null default false
  check(delivery_verified=false),
 shipping_authorized boolean not null default false
  check(shipping_authorized=false),
 sealed_at timestamptz not null default now(),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id)
  on delete restrict
);
comment on table apex_internal.order_delivery_envelopes is
 'Opaque encrypted destination only. No decryption key, plaintext address, verified destination claim or shipping authorization. Future key owner must be off-database.';

-- Append-only enforcement. Even privileged accidental updates/deletes fail;
-- future state observations must use separate append-only event tables.
create function apex_internal.deny_order_detail_mutation()
 returns trigger language plpgsql security invoker
 set search_path=pg_catalog as $fn$
begin
 raise exception 'Order detail snapshots are immutable'
  using errcode='55000';
end $fn$;
revoke all on function apex_internal.deny_order_detail_mutation()
 from public,anon,authenticated;
create trigger apex_order_detail_immutable
 before update or delete on apex_internal.order_detail_snapshots
 for each row execute function apex_internal.deny_order_detail_mutation();
create trigger apex_order_line_immutable
 before update or delete on apex_internal.order_line_snapshots
 for each row execute function apex_internal.deny_order_detail_mutation();
create trigger apex_order_delivery_immutable
 before update or delete on apex_internal.order_delivery_envelopes
 for each row execute function apex_internal.deny_order_detail_mutation();

alter table apex_internal.order_detail_snapshots enable row level security;
alter table apex_internal.order_detail_snapshots force row level security;
alter table apex_internal.order_line_snapshots enable row level security;
alter table apex_internal.order_line_snapshots force row level security;
alter table apex_internal.order_delivery_envelopes enable row level security;
alter table apex_internal.order_delivery_envelopes force row level security;
revoke all on apex_internal.order_detail_snapshots,
 apex_internal.order_line_snapshots,
 apex_internal.order_delivery_envelopes from public,anon,authenticated;

-- Only a privacy-safe readiness/count overview is exposed to existing
-- supplier members. No line, recipient, product, payment or address fields.
-- This is deliberately NOT an order export or fulfillment queue.
create function public.get_supplier_order_detail_foundation(p_store_id uuid)
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid());v_orders integer;
 v_lines integer;v_sealed integer;
begin
 if v_uid is null or p_store_id is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
  ) then raise exception 'Supplier membership required' using errcode='42501';end if;
 select count(*)::integer into v_orders from
  apex_internal.order_detail_snapshots where store_id=p_store_id;
 select count(*)::integer into v_lines from
  apex_internal.order_line_snapshots where store_id=p_store_id;
 select count(*)::integer into v_sealed from
  apex_internal.order_delivery_envelopes where store_id=p_store_id;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'order_snapshots',v_orders,'line_snapshots',v_lines,
  'sealed_destinations',v_sealed,
  'source','verified_sales_history',
  'order_ingest_enabled',false,
  'delivery_decryption_enabled',false,
  'shipping_enabled',false,'payment_enabled',false,
  'detail_status','held_unverified');
end $fn$;
revoke all on function public.get_supplier_order_detail_foundation(uuid)
 from public,anon,authenticated;
grant execute on function public.get_supplier_order_detail_foundation(uuid)
 to authenticated;

do $postflight$
begin
 if has_table_privilege('anon','apex_internal.order_detail_snapshots','SELECT')
  or has_table_privilege('authenticated','apex_internal.order_detail_snapshots','INSERT')
  or has_table_privilege('authenticated','apex_internal.order_line_snapshots','SELECT')
  or has_table_privilege('authenticated','apex_internal.order_delivery_envelopes','SELECT')
  or has_function_privilege('anon','public.get_supplier_order_detail_foundation(uuid)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Private order detail postflight denied';end if;
end $postflight$;
commit;
