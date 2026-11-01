-- PR #124: One-shot, disposable-regtest ONLY journal registration after
-- dual-control. NOT a hosted migration; NEVER invokes Greenfield POST,
-- payout processor, real checkout or Prism settings.
-- The original immutable split-sync hold is never removed.
begin;

create table public.btcpay_test_checkout_resume_permits (
 scope_id uuid primary key references public.btcpay_test_split_sync_holds(scope_id)
    on delete restrict,
 request_id uuid not null unique references public.btcpay_test_release_requests(id)
    on delete restrict,
 audit_head_id bigint not null references public.btcpay_test_sync_recovery_events(id)
    on delete restrict,
 status text not null default 'open' check(status in('open','consumed','revoked')),
 created_at timestamptz not null default clock_timestamp(),
 terminal_at timestamptz,
 check((status='open' and terminal_at is null) or
       (status in('consumed','revoked') and terminal_at is not null))
);
alter table public.btcpay_test_checkout_resume_permits enable row level security;
revoke all on public.btcpay_test_checkout_resume_permits
 from PUBLIC,anon,authenticated;
grant select on public.btcpay_test_checkout_resume_permits to authenticated;
create policy btcpay_test_resume_permits_admin_read
 on public.btcpay_test_checkout_resume_permits for select to authenticated
 using(exists(select 1 from public.apex_admin_memberships a
     where a.user_id=(select auth.uid())) and
     (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');

-- Only OPEN -> CONSUMED / REVOKED is legal. Closing is permanent.
create function apex_test_internal.enforce_test_resume_permit_terminal()
returns trigger language plpgsql security definer set search_path='' as $
begin
 if tg_op='DELETE' then
    raise exception 'Disposable checkout permit is append-only'
      using errcode='55000';
 end if;
 if old.status<>'open' or new.status not in ('consumed','revoked') or
    new.scope_id is distinct from old.scope_id or
    new.request_id is distinct from old.request_id or
    new.audit_head_id is distinct from old.audit_head_id or
    new.created_at is distinct from old.created_at or
    new.terminal_at is null then
   raise exception 'Disposable checkout permit cannot be reset or rewritten'
     using errcode='55000';
 end if;
 return new;
end; $;
revoke all on function apex_test_internal.enforce_test_resume_permit_terminal()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_resume_permits_terminal
 before update or delete on public.btcpay_test_checkout_resume_permits
 for each row execute function apex_test_internal.enforce_test_resume_permit_terminal();

-- Internal disposable operator obtains a single-use permit only after the
-- two-admin signatures and PINNED recovery evidence are revalidated while
-- holding the exact same advisory lock as all test-journal invoice writers.
-- This function is not exposed to browser roles or application routes.
create function apex_test_internal.open_btcpay_test_checkout_resume(p_scope uuid)
returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare
 v_approval public.btcpay_test_release_approvals%rowtype;
 v_request public.btcpay_test_release_requests%rowtype;
begin
 if p_scope is null then raise exception 'Storefront required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(
    hashtextextended('storefront:'||p_scope::text,0));
 select * into v_approval from public.btcpay_test_release_approvals
    where scope_id=p_scope;
 if not found then raise exception 'Independent release approval required'
     using errcode='55000'; end if;
 select * into v_request from public.btcpay_test_release_requests
    where id=v_approval.request_id and scope_id=p_scope;
 if not found or v_request.requested_by=v_approval.approved_by or
    v_request.rule_id is distinct from v_approval.rule_id or
    v_request.rule_version is distinct from v_approval.rule_version or
    v_request.allocation_snapshot is distinct from v_approval.allocation_snapshot or
    v_request.audit_head_id is distinct from v_approval.audit_head_id then
    raise exception 'Conflicting release signatures' using errcode='55000';
 end if;
 if not apex_test_internal.test_release_evidence_current(
     p_scope,v_approval.rule_id,v_approval.rule_version,
     v_approval.allocation_snapshot,v_approval.audit_head_id) then
    raise exception 'Stale or incomplete release evidence' using errcode='55000';
 end if;
 if exists(select 1 from public.btcpay_test_checkout_resume_permits
           where scope_id=p_scope) then
    raise exception 'One-shot resume permit was already issued'
       using errcode='55000';
 end if;
 insert into public.btcpay_test_checkout_resume_permits(
    scope_id,request_id,audit_head_id,status)
 values(p_scope,v_request.id,v_request.audit_head_id,'open');
 return 'one_test_journal_insert_eligible_hold_not_removed';
end; $$;
revoke all on function apex_test_internal.open_btcpay_test_checkout_resume(uuid)
 from PUBLIC,anon,authenticated;

-- Replace PR #120's disposable INSERT trigger logic: it retains the original
-- store advisory lock, rejects held stores by default, and permits EXACTLY
-- one registered regtest journal invoice after a verified, unconsumed permit.
-- No direct provider invoice creation is performed or protected here.
create or replace function apex_test_internal.gate_btcpay_test_invoice_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_permit public.btcpay_test_checkout_resume_permits%rowtype;
 v_approval public.btcpay_test_release_approvals%rowtype;
begin
 if new.apex_store_id is null then
   raise exception 'Storefront required' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||new.apex_store_id::text,0));
 if exists(select 1 from public.btcpay_test_split_sync_holds h
           where h.scope_id=new.apex_store_id and h.status='held') then
   select * into v_permit from public.btcpay_test_checkout_resume_permits
     where scope_id=new.apex_store_id;
   if not found or v_permit.status<>'open' or
      new.bitcoin_network<>'regtest' then
     raise exception 'Storefront on split-sync hold; invoice creation disabled'
       using errcode='55000';
   end if;
   select * into v_approval from public.btcpay_test_release_approvals
      where scope_id=new.apex_store_id and
        request_id=v_permit.request_id and
        audit_head_id=v_permit.audit_head_id;
   if not found or not apex_test_internal.test_release_evidence_current(
       new.apex_store_id,v_approval.rule_id,v_approval.rule_version,
       v_approval.allocation_snapshot,v_approval.audit_head_id) then
     raise exception 'Stale test checkout resume; invoice creation disabled'
       using errcode='55000';
   end if;
 end if;
 return new;
end; $$;
revoke all on function apex_test_internal.gate_btcpay_test_invoice_insert()
 from PUBLIC,anon,authenticated;

-- This trigger fires only on a SUCCESSFUL test journal insert, atomically
-- consumes the single-use permit in the same transaction; rollback restores
-- the open permit. Once consumed, the immutable hold again rejects all writes.
create function apex_test_internal.consume_btcpay_test_checkout_resume()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.btcpay_test_checkout_resume_permits
    set status='consumed', terminal_at=pg_catalog.clock_timestamp()
    where scope_id=new.apex_store_id and status='open';
 return new;
end; $$;
revoke all on function apex_test_internal.consume_btcpay_test_checkout_resume()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_invoice_consume_resume
 after insert on public.btcpay_test_invoices
 for each row execute function apex_test_internal.consume_btcpay_test_checkout_resume();

-- An incident or ANY NEW audit evidence atomically revokes a still-open
-- permit. Since the audit writer and invoice writer take the same storefront
-- advisory lock, neither can overtake a committed event from the other.
-- A 'consumed' permit cannot become open again.
create function apex_test_internal.revoke_btcpay_test_resume_on_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.btcpay_test_checkout_resume_permits
    set status='revoked',terminal_at=pg_catalog.clock_timestamp()
    where scope_id=new.scope_id and status='open';
 return new;
end; $$;
revoke all on function apex_test_internal.revoke_btcpay_test_resume_on_audit()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_audit_revokes_checkout_resume
 after insert on public.btcpay_test_sync_recovery_events
 for each row execute function apex_test_internal.revoke_btcpay_test_resume_on_audit();

commit;
