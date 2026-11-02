-- REVIEW-ONLY (not a Supabase migration): isolated BTCPay test receipt journal.
-- Run ONLY in disposable PostgreSQL CI until separately approved and reviewed.
-- This schema stores synthetic/regtest or testnet invoice references; no real payments.
-- No API routes, workers, signing keys, checkout or actual payout operations.
begin;

create schema if not exists apex_test_internal;
revoke all on schema apex_test_internal from PUBLIC, anon, authenticated;

create table public.btcpay_test_invoices (
  id uuid primary key default gen_random_uuid(),
  apex_store_id uuid not null references public.stores(id) on delete restrict,
  btcpay_store_id text not null check (btcpay_store_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  invoice_id text not null check (invoice_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  order_reference text not null check (order_reference ~ '^[A-Za-z0-9_-]{1,100}$'),
  expected_amount_cents bigint not null check (expected_amount_cents between 1 and 100000000),
  bitcoin_network text not null check (bitcoin_network in ('regtest', 'testnet')),
  created_at timestamptz not null default now(),
  unique (btcpay_store_id, invoice_id),
  unique (apex_store_id, order_reference)
);

-- Receive verified signed events only in a future, separate trusted worker.
-- Primary key makes delivery IDs idempotent within the BTCPay store.
create table public.btcpay_test_webhook_receipts (
  btcpay_store_id text not null,
  delivery_id text not null check (delivery_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  invoice_id text not null,
  event_type text not null check (event_type in (
    'InvoiceCreated', 'InvoiceReceivedPayment', 'InvoiceProcessing',
    'InvoiceExpired', 'InvoiceSettled', 'InvoiceInvalid', 'InvoicePaymentSettled'
  )),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  primary key (btcpay_store_id, delivery_id),
  unique (btcpay_store_id, delivery_id, invoice_id),
  foreign key (btcpay_store_id, invoice_id)
    references public.btcpay_test_invoices(btcpay_store_id, invoice_id) on delete restrict
);

-- Append-only provider observation, NOT confirmation of on-chain settlement.
-- The composite foreign key prevents pairing one delivery with another invoice.
create table public.btcpay_test_invoice_observations (
  id bigint generated always as identity primary key,
  btcpay_store_id text not null,
  delivery_id text not null,
  invoice_id text not null,
  invoice_status text not null check (invoice_status in (
    'New', 'Processing', 'Settled', 'Expired', 'Invalid'
  )),
  additional_status text not null check (additional_status in (
    'None', 'PaidPartial', 'PaidOver', 'PaidLate', 'Marked', 'Invalid'
  )),
  assessment text not null check (assessment in (
    'awaiting', 'processing', 'settled_invoice_reported',
    'expired', 'invalid', 'exception_manual_review'
  )),
  observed_at timestamptz not null default now(),
  unique (btcpay_store_id, delivery_id),
  foreign key (btcpay_store_id, delivery_id, invoice_id)
    references public.btcpay_test_webhook_receipts(
      btcpay_store_id, delivery_id, invoice_id
    ) on delete restrict,
  check (
    (additional_status <> 'None' and assessment='exception_manual_review')
    or
    (additional_status='None' and (
      (invoice_status='New' and assessment='awaiting') or
      (invoice_status='Processing' and assessment='processing') or
      (invoice_status='Settled' and assessment='settled_invoice_reported') or
      (invoice_status='Expired' and assessment='expired') or
      (invoice_status='Invalid' and assessment='invalid')
    ))
  )
);

create index btcpay_test_invoices_store_idx
  on public.btcpay_test_invoices(apex_store_id, created_at);
create index btcpay_test_receipts_invoice_idx
  on public.btcpay_test_webhook_receipts(btcpay_store_id,invoice_id,received_at);

alter table public.btcpay_test_invoices enable row level security;
alter table public.btcpay_test_webhook_receipts enable row level security;
alter table public.btcpay_test_invoice_observations enable row level security;

revoke all on public.btcpay_test_invoices,
  public.btcpay_test_webhook_receipts,
  public.btcpay_test_invoice_observations
  from PUBLIC, anon, authenticated;

-- Only vetted platform administrators can inspect payment test records.
-- No browser INSERT/UPDATE/DELETE, including for administrators.
grant select on public.btcpay_test_invoices,
  public.btcpay_test_webhook_receipts,
  public.btcpay_test_invoice_observations to authenticated;

create policy btcpay_test_invoices_admin_read on public.btcpay_test_invoices
 for select to authenticated using (
  exists (select 1 from public.apex_admin_memberships m
    where m.user_id=(select auth.uid()))
 );
create policy btcpay_test_receipts_admin_read on public.btcpay_test_webhook_receipts
 for select to authenticated using (
  exists (select 1 from public.apex_admin_memberships m
    where m.user_id=(select auth.uid()))
 );
create policy btcpay_test_observations_admin_read on public.btcpay_test_invoice_observations
 for select to authenticated using (
  exists (select 1 from public.apex_admin_memberships m
    where m.user_id=(select auth.uid()))
 );

-- Reject all updates/deletes including privileged application attempts.
-- A correction is a new append-only event in a separately reviewed workflow.
create function apex_test_internal.block_test_receipt_mutation()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog
as $$
begin
  raise exception 'BTCPay test receipt journal is append-only'
    using errcode='55000';
end;
$$;
revoke all on function apex_test_internal.block_test_receipt_mutation()
  from PUBLIC,anon,authenticated;

create trigger btcpay_test_invoice_no_mutation
 before update or delete on public.btcpay_test_invoices
 for each row execute function apex_test_internal.block_test_receipt_mutation();
create trigger btcpay_test_delivery_no_mutation
 before update or delete on public.btcpay_test_webhook_receipts
 for each row execute function apex_test_internal.block_test_receipt_mutation();
create trigger btcpay_test_observation_no_mutation
 before update or delete on public.btcpay_test_invoice_observations
 for each row execute function apex_test_internal.block_test_receipt_mutation();

commit;
