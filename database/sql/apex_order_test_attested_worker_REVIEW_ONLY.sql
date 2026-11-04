-- Issue #214 phase 4: disposable, attested worker + confidential denial audit.
-- NOT a production migration, no Supabase API route, no live order source.
\set ON_ERROR_STOP on
\if :{?worker_password}
\else
  \echo 'STOP: no ephemeral worker password provided'
  \quit 3
\endif

do $preflight$
begin
 if current_database()<>'apex_test'
    or to_regprocedure('apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb)') is null
    or (select enabled from apex_internal.private_release_gate where singleton)
        is distinct from false
 then raise exception 'Held worker is disposable-only and release must remain off'; end if;
end $preflight$;

begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create role apex_test_held_order_worker with
 login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
 password :'worker_password';
grant connect on database apex_test to apex_test_held_order_worker;
create schema apex_test_order_worker;
revoke all on schema apex_test_order_worker from public,anon,authenticated;
grant usage on schema apex_test_order_worker to apex_test_held_order_worker;

-- Permit creation is reserved for a separate, independently authenticated
-- source verifier. The worker cannot mint, read, update, or renew permits.
create table apex_internal.held_order_source_permits (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 sale_id uuid not null references public.supplier_sales_history(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 attestation_origin text not null check(attestation_origin='independent_test_review'),
 issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 check(expires_at>issued_at and expires_at<=issued_at+interval '10 minutes')
);
create table apex_internal.held_order_worker_bindings (
 store_id uuid primary key references public.stores(id) on delete restrict,
 active boolean not null default false,
 worker_identity text not null default 'apex_test_held_order_worker'
   check(worker_identity='apex_test_held_order_worker'),
 changed_at timestamptz not null default clock_timestamp()
);
create table apex_internal.held_order_denial_events (
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 denial_code text not null check(denial_code in (
  'invalid_signature','stale_source','unauthorized_store',
  'source_mismatch','invalid_payload','replay_conflict','database_rejected')),
 actor_role text not null check(actor_role='apex_test_held_order_worker'),
 occurred_at timestamptz not null default clock_timestamp()
);
create trigger apex_held_order_denial_immutable
 before update or delete on apex_internal.held_order_denial_events
 for each row execute function apex_internal.deny_order_detail_mutation();

alter table apex_internal.held_order_source_permits enable row level security;
alter table apex_internal.held_order_source_permits force row level security;
alter table apex_internal.held_order_worker_bindings enable row level security;
alter table apex_internal.held_order_worker_bindings force row level security;
alter table apex_internal.held_order_denial_events enable row level security;
alter table apex_internal.held_order_denial_events force row level security;
revoke all on apex_internal.held_order_source_permits,
 apex_internal.held_order_worker_bindings,
 apex_internal.held_order_denial_events
 from public,anon,authenticated,apex_test_held_order_worker;

-- This tightly scoped SECURITY DEFINER bridge is in a non-exposed schema.
-- The real connected worker remains unimplemented; only a CI psql role can
-- call this bridge, with independently seeded time-bounded one-shot permits.
create function apex_test_order_worker.commit_attested_held_order(
 p_permit uuid,p_header jsonb,p_lines jsonb,p_delivery jsonb,p_accounting jsonb)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
declare
 v_store uuid;
 v_sale uuid;
 v_hash text;
 v_permit apex_internal.held_order_source_permits%rowtype;
 v_result jsonb;
begin
 if session_user<>'apex_test_held_order_worker'
    or current_database()<>'apex_test'
 then raise exception 'Dedicated CI worker login required'
   using errcode='42501';end if;
 if jsonb_typeof(p_header)<>'object'
    or (p_header->>'store_id') is null
    or (p_header->>'sale_id') is null
    or (p_header->>'source_event_sha256') is null
 then raise exception 'Invalid attested header' using errcode='23514';end if;
 v_store:=(p_header->>'store_id')::uuid;
 v_sale:=(p_header->>'sale_id')::uuid;
 v_hash:=p_header->>'source_event_sha256';
 if v_hash !~ '^[0-9a-f]{64}$' or p_permit is null
 then raise exception 'Invalid attestation parameters'
   using errcode='23514';end if;
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Global release gate denied'
    using errcode='42501';end if;
 perform 1 from apex_internal.held_order_worker_bindings
  where store_id=v_store
   and worker_identity=session_user and active=true for share;
 if not found then raise exception 'Store binding is not authorized'
    using errcode='42501';end if;
 -- Row-level permit lock prevents simultaneous duplicate consumption. A
 -- second worker attempt cannot succeed after this transaction commits.
 select * into v_permit from apex_internal.held_order_source_permits
  where id=p_permit for update;
 if not found or v_permit.store_id is distinct from v_store
    or v_permit.sale_id is distinct from v_sale
    or v_permit.source_sha256 is distinct from v_hash
    or v_permit.attestation_origin<>'independent_test_review'
    or v_permit.consumed_at is not null
    or clock_timestamp()>=v_permit.expires_at
 then raise exception 'One-shot source attestation denied'
  using errcode='42501';end if;
 -- The original transaction-bound function independently validates the
 -- matching historical sale, items, totals, held flags and sealed destination.
 v_result:=apex_internal.persist_held_order_snapshot(
  p_header,p_lines,p_delivery,p_accounting);
 update apex_internal.held_order_source_permits
   set consumed_at=clock_timestamp() where id=p_permit and consumed_at is null;
 if not found then raise exception 'One-shot attestation consumed concurrently'
  using errcode='55000';end if;
 return v_result;
end $fn$;

-- A rejected transaction cannot durably audit itself in PostgreSQL. The
-- caller must separately record a failure using this metadata-only entry
-- point AFTER the failed transaction, with no event body or address fields.
create function apex_test_order_worker.record_held_order_denial(
 p_store uuid,p_source_sha256 text,p_denial_code text)
returns void language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
begin
 if session_user<>'apex_test_held_order_worker'
    or current_database()<>'apex_test'
 then raise exception 'Dedicated CI worker login required'
   using errcode='42501';end if;
 if p_store is null or p_source_sha256 !~ '^[0-9a-f]{64}$'
    or p_denial_code not in (
     'invalid_signature','stale_source','unauthorized_store',
     'source_mismatch','invalid_payload','replay_conflict','database_rejected')
 then raise exception 'Invalid confidential denial metadata'
   using errcode='22023';end if;
 perform 1 from apex_internal.held_order_worker_bindings
 where store_id=p_store and worker_identity=session_user and active=true for share;
 if not found then raise exception 'Denial audit denied for unbound store'
    using errcode='42501';end if;
 insert into apex_internal.held_order_denial_events(
  store_id,source_sha256,denial_code,actor_role)
 values(p_store,p_source_sha256,p_denial_code,session_user);
end $fn$;

revoke all on function apex_test_order_worker.commit_attested_held_order(
 uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function apex_test_order_worker.record_held_order_denial(
 uuid,text,text) from public,anon,authenticated;
grant execute on function apex_test_order_worker.commit_attested_held_order(
 uuid,jsonb,jsonb,jsonb,jsonb) to apex_test_held_order_worker;
grant execute on function apex_test_order_worker.record_held_order_denial(
 uuid,text,text) to apex_test_held_order_worker;

do $postflight$
declare v_name text;
begin
 foreach v_name in array array[
  'apex_internal.order_detail_snapshots',
  'apex_internal.order_line_snapshots',
  'apex_internal.order_delivery_envelopes',
  'apex_internal.held_order_intake_accounting',
  'apex_internal.held_order_intake_audit',
  'apex_internal.held_order_source_permits',
  'apex_internal.held_order_worker_bindings',
  'apex_internal.held_order_denial_events',
  'public.supplier_sales_history',
  'public.products'
 ] loop
  if has_table_privilege('apex_test_held_order_worker',v_name,'SELECT')
    or has_table_privilege('apex_test_held_order_worker',v_name,'INSERT')
    or has_table_privilege('apex_test_held_order_worker',v_name,'UPDATE')
    or has_table_privilege('apex_test_held_order_worker',v_name,'DELETE')
  then raise exception 'Order worker has direct table privilege on %',v_name;end if;
 end loop;
 if has_schema_privilege('apex_test_held_order_worker','apex_internal','USAGE')
    or has_function_privilege('anon',
     'apex_test_order_worker.commit_attested_held_order(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated',
     'apex_test_order_worker.record_held_order_denial(uuid,text,text)','EXECUTE')
 then raise exception 'Order worker privilege boundaries were not enforced';end if;
end $postflight$;
commit;
