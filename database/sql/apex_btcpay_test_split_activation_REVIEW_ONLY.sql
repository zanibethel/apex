-- PR #119: REVIEW ONLY. Disposable PostgreSQL fixture, NEVER a hosted migration.
-- This records an admin-reviewed *candidate*, never Prism configuration or
-- active payout rules. Zero production authority, keys, or money movement.
begin;

-- Only a future independently trusted payout-reconciliation worker could write
-- finality evidence. This synthetic table has no browser INSERT privilege.
create table public.btcpay_test_invoice_finality_proofs (
  btcpay_store_id text not null,
  invoice_id text not null,
  confirmed_claims boolean not null check (confirmed_claims),
  confirmed_wallet_receipts boolean not null check (confirmed_wallet_receipts),
  proof_recorded_at timestamptz not null default now(),
  primary key (btcpay_store_id,invoice_id),
  foreign key (btcpay_store_id,invoice_id) references
    public.btcpay_test_invoices(btcpay_store_id,invoice_id) on delete restrict
);
alter table public.btcpay_test_invoice_finality_proofs enable row level security;
revoke all on public.btcpay_test_invoice_finality_proofs from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_invoice_finality_proofs to authenticated;
create policy btcpay_test_finality_admin_read
  on public.btcpay_test_invoice_finality_proofs for select to authenticated
  using(exists(select 1 from public.apex_admin_memberships m
   where m.user_id=(select auth.uid())));
create trigger btcpay_test_finality_no_mutation
 before update or delete on public.btcpay_test_invoice_finality_proofs
 for each row execute function apex_test_internal.block_test_receipt_mutation();

create table public.btcpay_test_split_activation_reviews (
  rule_id uuid primary key references public.payout_rules(id) on delete restrict,
  scope_id uuid not null references public.stores(id) on delete restrict,
  rule_version integer not null check(rule_version>0),
  -- Exact canonical JSON snapshot, not a mutable pointer to recipient records.
  allocation_snapshot jsonb not null,
  status text not null check(status in ('blocked','approved_pending_manual_sync')),
  invoice_blockers integer not null check(invoice_blockers>=0),
  transfer_blockers integer not null check(transfer_blockers>=0),
  conflicting_rule_blockers integer not null check(conflicting_rule_blockers>=0),
  reviewed_by uuid not null references auth.users(id),
  assessed_at timestamptz not null default now()
);
-- At most one approved pending candidate per storefront.
create unique index btcpay_test_one_ready_candidate_per_store
  on public.btcpay_test_split_activation_reviews(scope_id)
  where status='approved_pending_manual_sync';

alter table public.btcpay_test_split_activation_reviews enable row level security;
revoke all on public.btcpay_test_split_activation_reviews from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_split_activation_reviews to authenticated;
create policy btcpay_test_reviews_admin_read
  on public.btcpay_test_split_activation_reviews for select to authenticated
  using(exists(select 1 from public.apex_admin_memberships a
     where a.user_id=(select auth.uid())));

-- Once a rule is approved for *manual* sync, the source allocation is immutable,
-- despite its still having a 'draft' status in the existing legacy table.
-- To change ratios, a verified administrator must create a fresh draft version.
create function apex_test_internal.block_approved_split_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $$
declare
  v_rule uuid;
begin
  v_rule:=case when tg_op='INSERT' then new.rule_id else old.rule_id end;
  if exists(select 1 from public.btcpay_test_split_activation_reviews
   where rule_id=v_rule and status='approved_pending_manual_sync') then
     raise exception 'Approved test split is immutable; create a new version'
       using errcode='55000';
  end if;
  if tg_op='UPDATE' and new.rule_id<>old.rule_id and exists(
    select 1 from public.btcpay_test_split_activation_reviews
    where rule_id=new.rule_id and status='approved_pending_manual_sync'
  ) then
    raise exception 'Cannot change an approved test split'
      using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function apex_test_internal.block_approved_split_mutation()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_approved_allocation_guard
 before insert or update or delete on public.payout_rule_allocations
 for each row execute function apex_test_internal.block_approved_split_mutation();

create function apex_test_internal.block_approved_rule_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.btcpay_test_split_activation_reviews
   where rule_id=old.id and status='approved_pending_manual_sync') then
   raise exception 'Cannot change reviewed test rule; start a new version'
     using errcode='55000';
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function apex_test_internal.block_approved_rule_mutation()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_approved_rule_guard
 before update or delete on public.payout_rules
 for each row execute function apex_test_internal.block_approved_rule_mutation();

-- A privilege-checked read-and-record review ONLY. Never enables Prism,
-- never sets payout_rules.status='active', and never signs BTC transfers.
-- Snapshot is point-in-time. A future synchronization must independently
-- re-check this barrier while holding the same scope lock as invoice writers.
create function public.review_btcpay_test_split_activation(p_rule_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_scope uuid;
  v_type text;
  v_version integer;
  v_current_status text;
  v_allocations jsonb;
  v_total integer;
  v_count integer;
  v_nonactive integer;
  v_invoices integer;
  v_transfers integer;
  v_conflicts integer;
  v_previous text;
  v_result text;
begin
 if auth.uid() is null or
   coalesce(auth.jwt()->'app_metadata'->>'apex_role','')<>'platform_admin' or
   not exists(select 1 from public.apex_admin_memberships
              where user_id=auth.uid()) then
   raise exception 'Verified platform administrator required'
     using errcode='42501';
 end if;
 if p_rule_id is null then
   raise exception 'Missing draft rule' using errcode='22023';
 end if;
 select scope_id,scope_type,version,status
 into v_scope,v_type,v_version,v_current_status
 from public.payout_rules where id=p_rule_id;
 if not found or v_type<>'storefront' or v_current_status<>'draft' or
    not exists(select 1 from public.stores where id=v_scope)
 then
   raise exception 'Only existing storefront drafts can be reviewed'
     using errcode='22023';
 end if;

 -- Serializes competing reviews and draft version allocation for this store.
 -- ALL future invoice creation and Prism sync writers MUST take this lock.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||v_scope::text,0));
 -- Defensive second read after lock to close edit/review races.
 perform 1 from public.payout_rules where id=p_rule_id
    and status='draft' and scope_id=v_scope for update;
 if not found then
   raise exception 'Draft changed while awaiting lock' using errcode='40001';
 end if;
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'recipient_id',a.recipient_id,'basis_points',a.basis_points)
   order by a.recipient_id),'[]'::jsonb),
   count(*),coalesce(sum(a.basis_points),0),
   count(*) filter (where r.id is null or r.status<>'active')
 into v_allocations,v_count,v_total,v_nonactive
 from public.payout_rule_allocations a
 left join public.payout_recipients r on r.id=a.recipient_id
 where a.rule_id=p_rule_id;
 if v_count<2 or v_total<>10000 or v_nonactive<>0 then
   raise exception 'At least two active recipients must total 10000 bps'
     using errcode='22023';
 end if;

 -- Must have a proven finality record for EVERY invoice ever created
 -- in the storefront. A BTCPay Settled event by itself is insufficient.
 select count(*) into v_invoices
 from public.btcpay_test_invoices i
 left join public.btcpay_test_order_status o
   on o.btcpay_store_id=i.btcpay_store_id
   and o.invoice_id=i.invoice_id
 left join public.btcpay_test_invoice_finality_proofs f
   on f.btcpay_store_id=i.btcpay_store_id and f.invoice_id=i.invoice_id
 where i.apex_store_id=v_scope and (
  o.status is distinct from 'settled_reported' or
  f.invoice_id is null or
  f.confirmed_claims is distinct from true or
  f.confirmed_wallet_receipts is distinct from true
 );

 -- Every previous allocation row must have an actual confirmed transfer.
 -- An omitted transfer, pending, failed, or reversed entry blocks changes.
 select count(*) into v_transfers
 from public.payment_allocation_snapshots s
 join public.payout_rules r on r.id=s.rule_id
 join public.payment_allocation_entries e on e.snapshot_id=s.id
 left join public.payout_transfer_records t
   on t.snapshot_id=e.snapshot_id and t.recipient_id=e.recipient_id
 where r.scope_type='storefront' and r.scope_id=v_scope
   and (t.id is null or t.state<>'confirmed');

 -- No concurrent approved/scheduled/active rule for this exact scope.
 select count(*) into v_conflicts
 from public.payout_rules r
 where r.scope_type='storefront' and r.scope_id=v_scope
   and r.id<>p_rule_id and r.status in ('scheduled','active');
 select v_conflicts+count(*) into v_conflicts
 from public.btcpay_test_split_activation_reviews c
 where c.scope_id=v_scope and c.rule_id<>p_rule_id
   and c.status='approved_pending_manual_sync';

 v_result:=case when v_invoices=0 and v_transfers=0 and v_conflicts=0
   then 'approved_pending_manual_sync' else 'blocked' end;
 select status into v_previous from public.btcpay_test_split_activation_reviews
   where rule_id=p_rule_id for update;
 -- A future newly-created invoice can revoke previous approval on reassessment;
 -- this result is NEVER final authorization for a transfer or rule switch.
 insert into public.btcpay_test_split_activation_reviews(
   rule_id,scope_id,rule_version,allocation_snapshot,status,
   invoice_blockers,transfer_blockers,conflicting_rule_blockers,reviewed_by,
   assessed_at)
 values(p_rule_id,v_scope,v_version,v_allocations,v_result,
   v_invoices,v_transfers,v_conflicts,auth.uid(),now())
 on conflict(rule_id) do update set
   allocation_snapshot=excluded.allocation_snapshot,
   status=excluded.status,
   invoice_blockers=excluded.invoice_blockers,
   transfer_blockers=excluded.transfer_blockers,
   conflicting_rule_blockers=excluded.conflicting_rule_blockers,
   reviewed_by=excluded.reviewed_by,
   assessed_at=excluded.assessed_at;
 return v_result;
end; $$;
revoke all on function public.review_btcpay_test_split_activation(uuid)
 from PUBLIC,anon;
grant execute on function public.review_btcpay_test_split_activation(uuid)
 to authenticated;
commit;
