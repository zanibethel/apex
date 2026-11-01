-- REVIEW ONLY: durable, regtest-only BTCPay order display status, NOT a production migration.
-- Extends database/sql/apex_btcpay_test_receipt_journal_REVIEW_ONLY.sql from PR #107.
-- Applied ONLY in disposable PostgreSQL CI. No checkout, payout, or order fulfillment.
begin;

create table public.btcpay_test_order_status (
  btcpay_store_id text not null,
  invoice_id text not null,
  order_reference text not null check (order_reference ~ '^[A-Za-z0-9_-]{1,100}$'),
  expected_amount_sats bigint not null check (expected_amount_sats between 1000 and 100000000),
  status text not null default 'awaiting' check (
    status in ('awaiting','processing','settled_reported','manual_review')
  ),
  status_revision bigint not null default 0 check (status_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (btcpay_store_id, invoice_id),
  foreign key (btcpay_store_id, invoice_id)
    references public.btcpay_test_invoices(btcpay_store_id, invoice_id)
    on delete restrict
);

-- Immutable audit of each NEW signed delivery, after the trusted worker has
-- independently re-read provider state and checked original order snapshot.
create table public.btcpay_test_order_status_history (
  id bigint generated always as identity primary key,
  btcpay_store_id text not null,
  delivery_id text not null,
  invoice_id text not null,
  provider_assessment text not null check (provider_assessment in (
    'awaiting','processing','settled_invoice_reported','expired','invalid',
    'exception_manual_review'
  )),
  display_status text not null check (
    display_status in ('awaiting','processing','settled_reported','manual_review')
  ),
  revision bigint not null check (revision > 0),
  observed_at timestamptz not null default now(),
  unique (btcpay_store_id, delivery_id),
  foreign key (btcpay_store_id, delivery_id, invoice_id)
    references public.btcpay_test_webhook_receipts(
      btcpay_store_id, delivery_id, invoice_id
    ) on delete restrict
);
create index btcpay_test_order_status_history_invoice_idx
 on public.btcpay_test_order_status_history(btcpay_store_id,invoice_id,revision);

alter table public.btcpay_test_order_status enable row level security;
alter table public.btcpay_test_order_status_history enable row level security;
revoke all on public.btcpay_test_order_status,
 public.btcpay_test_order_status_history from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_order_status,
 public.btcpay_test_order_status_history to authenticated;

create policy btcpay_test_order_status_admin_only on public.btcpay_test_order_status
 for select to authenticated using (
   exists (select 1 from public.apex_admin_memberships a
           where a.user_id=(select auth.uid()))
 );
create policy btcpay_test_order_history_admin_only on public.btcpay_test_order_status_history
 for select to authenticated using (
   exists (select 1 from public.apex_admin_memberships a
           where a.user_id=(select auth.uid()))
 );

-- Snapshot attributes cannot be rewritten, and status rows cannot be deleted.
-- Status+revision may be changed only by privileged database writers; no
-- browser role has UPDATE access. The audit history is fully append-only.
create function apex_test_internal.guard_order_snapshot()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $$
begin
  if tg_op='DELETE' then
    raise exception 'BTCPay test order status cannot be deleted'
      using errcode='55000';
  end if;
  if row(old.btcpay_store_id,old.invoice_id,old.order_reference,
         old.expected_amount_sats) is distinct from
     row(new.btcpay_store_id,new.invoice_id,new.order_reference,
         new.expected_amount_sats) then
    raise exception 'BTCPay test order snapshot is immutable'
      using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function apex_test_internal.guard_order_snapshot()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_status_snapshot_guard
 before update or delete on public.btcpay_test_order_status
 for each row execute function apex_test_internal.guard_order_snapshot();
create trigger btcpay_test_order_history_immutable
 before update or delete on public.btcpay_test_order_status_history
 for each row execute function apex_test_internal.block_test_receipt_mutation();

-- Trusted worker transaction contract. SECURITY INVOKER + no browser grants.
-- This function does NOT verify signatures or make an external Greenfield call.
-- Caller must verify raw HMAC, store, invoice, latest provider status, metadata,
-- currency/amount, and actual REGTEST chain before calling with these facts.
create function apex_test_internal.record_verified_btcpay_event(
 p_store_id text,
 p_invoice_id text,
 p_delivery_id text,
 p_event_type text,
 p_payload_sha256 text,
 p_order_reference text,
 p_amount_sats bigint,
 p_provider_status text,
 p_additional_status text,
 p_chain text
) returns text
language plpgsql security invoker
set search_path=pg_catalog as $$
declare
  v_order public.btcpay_test_order_status%rowtype;
  v_parent public.btcpay_test_invoices%rowtype;
  v_old public.btcpay_test_webhook_receipts%rowtype;
  v_inserted text;
  v_assessment text;
  v_display text;
begin
  if p_chain <> 'regtest' or p_chain is null then
    raise exception 'Only verified regtest events are accepted'
      using errcode='22023';
  end if;
  if p_event_type not in ('InvoiceCreated','InvoiceReceivedPayment',
       'InvoiceProcessing','InvoiceExpired','InvoiceSettled',
       'InvoiceInvalid','InvoicePaymentSettled') or p_event_type is null then
    raise exception 'Unsupported test invoice event' using errcode='22023';
  end if;
  if p_provider_status not in ('New','Processing','Settled','Expired','Invalid')
     or p_provider_status is null or
     p_additional_status not in ('None','PaidPartial','PaidOver','PaidLate',
         'Marked','Invalid') or p_additional_status is null then
    raise exception 'Unknown BTCPay invoice status' using errcode='22023';
  end if;
  if p_event_type='InvoiceSettled' and p_provider_status<>'Settled' then
    raise exception 'Signed settlement event not confirmed by provider'
      using errcode='22023';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_sha256 is null then
    raise exception 'Expected verified raw payload digest' using errcode='22023';
  end if;

  -- A row-level lock serializes concurrent webhook deliveries for this order.
  select * into v_order from public.btcpay_test_order_status
   where btcpay_store_id=p_store_id and invoice_id=p_invoice_id
   for update;
  if not found then
    raise exception 'Unknown synthetic test order' using errcode='22023';
  end if;
  select * into v_parent from public.btcpay_test_invoices
   where btcpay_store_id=p_store_id and invoice_id=p_invoice_id;
  if not found or v_parent.bitcoin_network <> 'regtest' or
     v_parent.order_reference is distinct from p_order_reference or
     v_order.order_reference is distinct from p_order_reference or
     v_order.expected_amount_sats is distinct from p_amount_sats then
    raise exception 'Test payment does not match trusted order snapshot'
      using errcode='22023';
  end if;

  -- Composite store+delivery unique key: repeat exact delivery is a no-op,
  -- conflicting hash/event/invoice is an error, never silent acceptance.
  insert into public.btcpay_test_webhook_receipts (
    btcpay_store_id,delivery_id,invoice_id,event_type,payload_sha256
  ) values (
    p_store_id,p_delivery_id,p_invoice_id,p_event_type,p_payload_sha256
  ) on conflict (btcpay_store_id,delivery_id) do nothing
    returning delivery_id into v_inserted;
  if v_inserted is null then
    select * into v_old from public.btcpay_test_webhook_receipts
     where btcpay_store_id=p_store_id and delivery_id=p_delivery_id;
    if not found or v_old.invoice_id is distinct from p_invoice_id or
       v_old.event_type is distinct from p_event_type or
       v_old.payload_sha256 is distinct from p_payload_sha256 then
      raise exception 'Conflicting BTCPay delivery replay'
        using errcode='23505';
    end if;
    return 'duplicate';
  end if;

  v_assessment := case
    when p_additional_status <> 'None' then 'exception_manual_review'
    when p_provider_status='New' then 'awaiting'
    when p_provider_status='Processing' then 'processing'
    when p_provider_status='Settled' then 'settled_invoice_reported'
    when p_provider_status='Expired' then 'expired'
    else 'invalid' end;

  insert into public.btcpay_test_invoice_observations (
    btcpay_store_id,delivery_id,invoice_id,invoice_status,
    additional_status,assessment
  ) values (
    p_store_id,p_delivery_id,p_invoice_id,p_provider_status,
    p_additional_status,v_assessment
  );

  -- Manual review is sticky. A stale processing webhook must not regress
  -- a previously reported settlement. Expired/invalid never count as paid.
  v_display := case
    when v_order.status='manual_review' or
         v_assessment in ('exception_manual_review','expired','invalid')
      then 'manual_review'
    when v_assessment='settled_invoice_reported'
      then 'settled_reported'
    when v_order.status='settled_reported'
      then 'settled_reported'
    when v_assessment='processing' or v_order.status='processing'
      then 'processing'
    else 'awaiting' end;

  update public.btcpay_test_order_status
    set status=v_display,
        status_revision=status_revision+1,
        updated_at=now()
    where btcpay_store_id=p_store_id and invoice_id=p_invoice_id;

  insert into public.btcpay_test_order_status_history (
    btcpay_store_id,delivery_id,invoice_id,provider_assessment,
    display_status,revision
  ) values (
    p_store_id,p_delivery_id,p_invoice_id,v_assessment,
    v_display,v_order.status_revision+1
  );
  return 'accepted';
end;
$$;
revoke all on function apex_test_internal.record_verified_btcpay_event(
 text,text,text,text,text,text,bigint,text,text,text
) from PUBLIC,anon,authenticated;

-- Test display status is NOT payment authorization; there are no order
-- fulfillment flags, ledger credits or payout writes in this SQL.
commit;
