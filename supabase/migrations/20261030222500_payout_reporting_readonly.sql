-- REVIEW ONLY: not applied. Depends on 20261029233701_apex_initial_catalog_readonly.sql.
-- No live checkout, transfers, payout activation, or seeded identities.
begin;
create table public.apex_admin_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.payout_recipients (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check(length(btrim(display_name))>0),
 recipient_type text not null check(recipient_type in ('platform','supplier','partner','other')),
 status text not null default 'inactive' check(status in ('inactive','active')),
 created_at timestamptz not null default now()
);
create table public.payout_recipient_memberships (
 recipient_id uuid not null references public.payout_recipients(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(recipient_id,user_id)
);
create table public.payout_rules (
 id uuid primary key default gen_random_uuid(),
 scope_type text not null check(scope_type in ('storefront','supplier','product')),
 scope_id uuid not null,
 version integer not null check(version>0),
 status text not null default 'draft' check(status in ('draft','scheduled','active','paused','archived')),
 effective_from timestamptz not null,
 effective_to timestamptz,
 created_at timestamptz not null default now(),
 check(effective_to is null or effective_to>effective_from),
 unique(scope_type,scope_id,version)
);
create table public.payout_rule_allocations (
 rule_id uuid not null references public.payout_rules(id) on delete restrict,
 recipient_id uuid not null references public.payout_recipients(id) on delete restrict,
 basis_points integer not null check(basis_points between 0 and 10000),
 primary key(rule_id,recipient_id)
);
-- Validate 10,000 bps in a trusted activation transaction, not on each draft insert.
create table public.payment_allocation_snapshots (
 id uuid primary key default gen_random_uuid(),
 external_order_ref text not null unique check(length(btrim(external_order_ref))>0),
 rule_id uuid not null references public.payout_rules(id) on delete restrict,
 rule_version integer not null check(rule_version>0),
 gross_sats bigint not null check(gross_sats>=0),
 distributable_sats bigint not null check(distributable_sats between 0 and gross_sats),
 created_at timestamptz not null default now()
);
create table public.payment_allocation_entries (
 snapshot_id uuid not null references public.payment_allocation_snapshots(id) on delete restrict,
 recipient_id uuid not null references public.payout_recipients(id) on delete restrict,
 basis_points integer not null check(basis_points between 0 and 10000),
 amount_sats bigint not null check(amount_sats>=0),
 primary key(snapshot_id,recipient_id)
);
create table public.payout_transfer_records (
 id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null,
 recipient_id uuid not null,
 amount_sats bigint not null check(amount_sats>=0),
 state text not null check(state in ('pending','submitted','confirmed','failed','reversed')),
 provider_reference text,
 created_at timestamptz not null default now(),
 foreign key(snapshot_id,recipient_id)
  references public.payment_allocation_entries(snapshot_id,recipient_id) on delete restrict
);
create index payout_recipient_memberships_user_idx on public.payout_recipient_memberships(user_id);
create index payout_rules_scope_idx on public.payout_rules(scope_type,scope_id,status,effective_from);
create index payment_allocations_recipient_idx on public.payment_allocation_entries(recipient_id,snapshot_id);
create index payout_transfer_recipient_idx on public.payout_transfer_records(recipient_id,created_at);
alter table public.apex_admin_memberships enable row level security;
alter table public.payout_recipients enable row level security;
alter table public.payout_recipient_memberships enable row level security;
alter table public.payout_rules enable row level security;
alter table public.payout_rule_allocations enable row level security;
alter table public.payment_allocation_snapshots enable row level security;
alter table public.payment_allocation_entries enable row level security;
alter table public.payout_transfer_records enable row level security;
revoke all on public.apex_admin_memberships,public.payout_recipients,
 public.payout_recipient_memberships,public.payout_rules,public.payout_rule_allocations,
 public.payment_allocation_snapshots,public.payment_allocation_entries,
 public.payout_transfer_records from PUBLIC,anon,authenticated;
grant select on public.apex_admin_memberships,public.payout_recipients,
 public.payout_recipient_memberships,public.payout_rules,public.payout_rule_allocations,
 public.payment_allocation_snapshots,public.payment_allocation_entries,
 public.payout_transfer_records to authenticated;
-- Admin membership table is only self-readable; never grant browser mutation.
create policy apex_admin_self_read on public.apex_admin_memberships
 for select to authenticated using(user_id=(select auth.uid()));
create policy payout_recipient_membership_self_read on public.payout_recipient_memberships
 for select to authenticated using(user_id=(select auth.uid()));
create policy payout_recipients_scoped_read on public.payout_recipients
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.payout_recipient_memberships m
   where m.recipient_id=payout_recipients.id and m.user_id=(select auth.uid()))
 );
create policy payout_rules_admin_read on public.payout_rules
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 );
create policy payout_rule_allocations_admin_read on public.payout_rule_allocations
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 );
create policy allocation_snapshots_admin_read on public.payment_allocation_snapshots
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 );
create policy allocation_entries_scoped_read on public.payment_allocation_entries
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.payout_recipient_memberships m
   where m.recipient_id=payment_allocation_entries.recipient_id and m.user_id=(select auth.uid()))
 );
create policy transfer_records_scoped_read on public.payout_transfer_records
 for select to authenticated using(
  exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.payout_recipient_memberships m
   where m.recipient_id=payout_transfer_records.recipient_id and m.user_id=(select auth.uid()))
 );
-- No client writes, no wallet keys, no seed data, no production activation.
commit;
