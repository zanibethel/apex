-- PR #188: private, held-only order and provider-invoice intent foundation.
-- Empty schema only: NO customer order API, invoice POST, wallet, webhook,
-- payment permission, product approval, or public checkout activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.stores') is null
   or to_regclass('apex_internal.private_release_gate') is null
   or not exists(select 1 from apex_internal.private_release_gate
      where singleton=true and enabled=false)
   or has_schema_privilege('anon','apex_internal','USAGE')
   or has_schema_privilege('authenticated','apex_internal','USAGE')
 then raise exception 'Checkout journal preflight denied';end if;
end $preflight$;

-- Stable historical amounts are never taken as authorization to charge.
-- Request hashes must come from a future authenticated, server-side controller.
create table apex_internal.checkout_order_intents (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 idempotency_hash text not null check (idempotency_hash ~ '^[0-9a-f]{64}$'),
 cart_hash text not null check (cart_hash ~ '^[0-9a-f]{64}$'),
 total_cents bigint not null check (total_cents between 1 and 999999999),
 currency text not null default 'USD' check (currency='USD'),
 item_count integer not null check (item_count between 1 and 50),
 status text not null default 'held_no_payment'
   check (status='held_no_payment'),
 created_at timestamptz not null default now(),
 unique(store_id,idempotency_hash),
 unique(id,store_id)
);
comment on table apex_internal.checkout_order_intents is
 'Held-only immutable journal foundation. No customer orders, stock reservation or payment permission.';

-- A provider intent is allowed only as a held record, never proof a POST
-- occurred. The exact store/order/amount coupling is enforced by trigger.
create table apex_internal.btcpay_invoice_post_intents (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 store_id uuid not null,
 provider_store_id text not null
   check (provider_store_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 provider_order_ref text not null
   check (provider_order_ref ~ '^[A-Za-z0-9_-]{1,100}$'),
 total_cents bigint not null check (total_cents between 1 and 999999999),
 currency text not null default 'USD' check (currency='USD'),
 status text not null default 'held_no_post' check (status='held_no_post'),
 created_at timestamptz not null default now(),
 foreign key(order_id,store_id)
   references apex_internal.checkout_order_intents(id,store_id)
   on delete restrict,
 unique(store_id,order_id),
 unique(provider_store_id,provider_order_ref)
);
comment on table apex_internal.btcpay_invoice_post_intents is
 'No provider call or payment permission. Held-only immutable provider intent, not an invoice.';

-- No policies and no database API grants: ordinary app roles cannot observe
-- or write any journal data, including if the private schema is later exposed.
alter table apex_internal.checkout_order_intents
 enable row level security;
alter table apex_internal.checkout_order_intents
 force row level security;
alter table apex_internal.btcpay_invoice_post_intents
 enable row level security;
alter table apex_internal.btcpay_invoice_post_intents
 force row level security;
revoke all on table apex_internal.checkout_order_intents
 from PUBLIC,anon,authenticated;
revoke all on table apex_internal.btcpay_invoice_post_intents
 from PUBLIC,anon,authenticated;

-- Immutable once inserted. A later feature will need a separate append-only
-- observation ledger, never silent mutation or a blind provider POST retry.
create function apex_internal.deny_checkout_journal_mutation()
 returns trigger language plpgsql security invoker
 set search_path=pg_catalog as $fn$
begin
 raise exception 'Immutable checkout journal cannot be updated or deleted'
  using errcode='55000';
end $fn$;
revoke all on function apex_internal.deny_checkout_journal_mutation()
 from PUBLIC,anon,authenticated;
create trigger apex_order_intents_append_only
 before update or delete on apex_internal.checkout_order_intents
 for each row execute function apex_internal.deny_checkout_journal_mutation();
create trigger apex_invoice_post_intents_append_only
 before update or delete on apex_internal.btcpay_invoice_post_intents
 for each row execute function apex_internal.deny_checkout_journal_mutation();

create function apex_internal.validate_held_btcpay_post_intent()
 returns trigger language plpgsql security invoker
 set search_path=pg_catalog as $fn$
declare v_order apex_internal.checkout_order_intents%rowtype;
begin
 select * into v_order from apex_internal.checkout_order_intents
  where id=new.order_id and store_id=new.store_id for key share;
 if not found or v_order.total_cents<>new.total_cents
  or v_order.currency<>new.currency
  or v_order.status<>'held_no_payment'
 then raise exception 'Provider intent does not match an immutable held order'
  using errcode='23514';end if;
 return new;
end $fn$;
revoke all on function apex_internal.validate_held_btcpay_post_intent()
 from PUBLIC,anon,authenticated;
create trigger apex_invoice_post_matches_order
 before insert on apex_internal.btcpay_invoice_post_intents
 for each row execute function apex_internal.validate_held_btcpay_post_intent();

-- Admin-only, aggregate readback. No customer identifiers, hashes, provider
-- references, API keys or public invoice operations escape this interface.
create function public.get_admin_checkout_journal_overview()
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_orders integer;v_intents integer;
begin
 if (select auth.uid()) is null or (select auth.jwt())
     #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 select count(*)::integer into v_orders
  from apex_internal.checkout_order_intents;
 select count(*)::integer into v_intents
  from apex_internal.btcpay_invoice_post_intents;
 return jsonb_build_object(
  'status','journal_foundation',
  'held_order_records',v_orders,
  'held_provider_intents',v_intents,
  'invoice_post_enabled',false,
  'checkout_enabled',false
 );
end $fn$;
revoke all on function public.get_admin_checkout_journal_overview()
 from PUBLIC,anon,authenticated;
grant execute on function public.get_admin_checkout_journal_overview()
 to authenticated;

do $postflight$
begin
 if has_table_privilege('anon',
      'apex_internal.checkout_order_intents','SELECT')
  or has_table_privilege('authenticated',
      'apex_internal.checkout_order_intents','INSERT')
  or has_table_privilege('authenticated',
      'apex_internal.btcpay_invoice_post_intents','INSERT')
  or has_function_privilege('anon',
      'public.get_admin_checkout_journal_overview()','EXECUTE')
  or (select enabled from apex_internal.private_release_gate
      where singleton=true) is distinct from false
 then raise exception 'Checkout journal postflight denied';end if;
end $postflight$;
commit;
