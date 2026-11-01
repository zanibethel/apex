-- PR #120. Disposable PostgreSQL ONLY. Never a hosted migration.
-- Shared storefront lock for test invoice registration and a fail-closed,
-- manually reviewed split-sync HOLD. No BTCPay API, Prism edit, or payout.
begin;

-- A hold persists after its transaction commits. It is intentionally not
-- released by this pass; clearing it needs a separate reviewed protocol.
create table public.btcpay_test_split_sync_holds (
 scope_id uuid primary key references public.stores(id) on delete restrict,
 rule_id uuid not null unique references public.payout_rules(id) on delete restrict,
 rule_version integer not null check(rule_version>0),
 allocation_snapshot jsonb not null,
 status text not null default 'held' check(status='held'),
 acquired_at timestamptz not null default now()
);
alter table public.btcpay_test_split_sync_holds enable row level security;
revoke all on public.btcpay_test_split_sync_holds from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_split_sync_holds to authenticated;
create policy btcpay_test_split_hold_admin_read
 on public.btcpay_test_split_sync_holds for select to authenticated
 using(exists(select 1 from public.apex_admin_memberships a
              where a.user_id=(select auth.uid())));

create trigger btcpay_test_split_hold_immutable
 before update or delete on public.btcpay_test_split_sync_holds
 for each row execute function apex_test_internal.block_test_receipt_mutation();

-- SECURITY DEFINER trigger executes regardless of the invoice writer's RLS
-- role. Every INSERT into the *test* invoice journal shares the exact store
-- advisory transaction lock used by PR #119's administrator review.
-- This does not fence independent external BTCPay invoice creation; production
-- code must acquire the gate BEFORE invoking Greenfield to create an invoice.
create function apex_test_internal.gate_btcpay_test_invoice_insert()
returns trigger language plpgsql security definer
set search_path='' as $$
begin
 if new.apex_store_id is null then
   raise exception 'Storefront required' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||new.apex_store_id::text,0));
 if exists(select 1 from public.btcpay_test_split_sync_holds h
           where h.scope_id=new.apex_store_id and h.status='held') then
   raise exception 'Storefront on split-sync hold; invoice creation disabled'
     using errcode='55000';
 end if;
 return new;
end; $$;
revoke all on function apex_test_internal.gate_btcpay_test_invoice_insert()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_invoice_store_gate
 before insert on public.btcpay_test_invoices
 for each row execute function apex_test_internal.gate_btcpay_test_invoice_insert();

-- Trusted, SQL-only test operator: requires the same store lock, and RECHECKS
-- approval, immutable allocations, settled+verified invoices, prior confirmed
-- allocation transfers and conflicting rules INSIDE its transaction.
-- The caller must additionally reconcile unknown provider-side invoices and
-- payments outside SQL; no provider attestation exists in this fixture.
-- Explicitly not callable from authenticated/anon or app code.
create function apex_test_internal.hold_btcpay_test_split_sync(p_rule_id uuid)
returns text language plpgsql security invoker
set search_path=pg_catalog as $$
declare
 v_scope uuid;
 v_version integer;
 v_status text;
 v_allocations jsonb;
 v_count bigint;
 v_total bigint;
 v_nonactive bigint;
 v_review public.btcpay_test_split_activation_reviews%rowtype;
 v_blockers bigint;
begin
 if p_rule_id is null then
   raise exception 'Missing candidate' using errcode='22023';
 end if;
 select scope_id,version,status into v_scope,v_version,v_status
   from public.payout_rules
   where id=p_rule_id and scope_type='storefront';
 if not found or v_status<>'draft' then
   raise exception 'Only reviewed storefront drafts may be held'
     using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(
   hashtextextended('storefront:'||v_scope::text,0));
 -- Lock rule and recipients to guard checked data during this transaction.
 perform 1 from public.payout_rules where id=p_rule_id and
    scope_id=v_scope and version=v_version and status='draft' for update;
 if not found then
   raise exception 'Candidate changed during lock' using errcode='40001';
 end if;
 select * into v_review from public.btcpay_test_split_activation_reviews
   where rule_id=p_rule_id for update;
 if not found or v_review.scope_id<>v_scope or
    v_review.rule_version<>v_version or
    v_review.status<>'approved_pending_manual_sync' or
    (v_review.invoice_blockers+v_review.transfer_blockers+
     v_review.conflicting_rule_blockers)<>0 then
   raise exception 'No clean administrator review for this version'
     using errcode='55000';
 end if;
 perform 1 from public.payout_recipients p
   join public.payout_rule_allocations a on a.recipient_id=p.id
   where a.rule_id=p_rule_id for share of p;
 select coalesce(jsonb_agg(jsonb_build_object(
   'recipient_id',a.recipient_id,'basis_points',a.basis_points)
   order by a.recipient_id),'[]'::jsonb),
   count(*),coalesce(sum(a.basis_points),0),
   count(*) filter(where r.id is null or r.status<>'active')
 into v_allocations,v_count,v_total,v_nonactive
 from public.payout_rule_allocations a
 left join public.payout_recipients r on r.id=a.recipient_id
 where a.rule_id=p_rule_id;
 if v_allocations is distinct from v_review.allocation_snapshot or
    v_count<2 or v_total<>10000 or v_nonactive<>0 then
   raise exception 'Allocation snapshot changed or recipients invalid'
     using errcode='55000';
 end if;
 if exists(select 1 from public.btcpay_test_invoices i
  left join public.btcpay_test_order_status o
   on o.btcpay_store_id=i.btcpay_store_id and o.invoice_id=i.invoice_id
  left join public.btcpay_test_invoice_finality_proofs f
   on f.btcpay_store_id=i.btcpay_store_id and f.invoice_id=i.invoice_id
  where i.apex_store_id=v_scope and (
    o.status is distinct from 'settled_reported' or
    f.invoice_id is null or f.confirmed_claims is distinct from true or
    f.confirmed_wallet_receipts is distinct from true
  )) then
   raise exception 'Outstanding or unverified test invoices'
     using errcode='55000';
 end if;
 if exists(select 1 from public.payment_allocation_snapshots s
  join public.payout_rules r on r.id=s.rule_id
  join public.payment_allocation_entries e on e.snapshot_id=s.id
  left join public.payout_transfer_records t
   on t.snapshot_id=e.snapshot_id and t.recipient_id=e.recipient_id
  where r.scope_type='storefront' and r.scope_id=v_scope
    and (t.id is null or t.state<>'confirmed')) then
   raise exception 'Outstanding payout allocation transfers'
     using errcode='55000';
 end if;
 if exists(select 1 from public.payout_rules r
  where r.scope_type='storefront' and r.scope_id=v_scope
    and r.id<>p_rule_id and r.status in ('scheduled','active')) or
    exists(select 1 from public.btcpay_test_split_activation_reviews r
  where r.scope_id=v_scope and r.rule_id<>p_rule_id
    and r.status='approved_pending_manual_sync') then
   raise exception 'Conflicting split candidate' using errcode='55000';
 end if;
 if exists(select 1 from public.btcpay_test_split_sync_holds
           where scope_id=v_scope) then
   raise exception 'Existing storefront sync hold' using errcode='55000';
 end if;
 insert into public.btcpay_test_split_sync_holds(
   scope_id,rule_id,rule_version,allocation_snapshot,status)
 values(v_scope,p_rule_id,v_version,v_allocations,'held');
 return 'held_no_provider_sync';
end; $$;
revoke all on function apex_test_internal.hold_btcpay_test_split_sync(uuid)
 from PUBLIC,anon,authenticated;
commit;
