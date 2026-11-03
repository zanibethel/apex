-- PR #174. DISPOSABLE PostgreSQL regtest only. NOT a hosted Supabase migration.
-- Install after PR #172 worker RPCs and #173 supplier bindings.
-- Two independent test database LOGINs approve post-crash/unknown readback.
-- An original worker gets one unrepeatable observation capability during
-- its reservation; after process death that capability cannot be reissued.
\set ON_ERROR_STOP on
\if :{?requester_password}
\else
  \echo 'STOP: missing disposable recovery requester password'
  \quit 3
\endif
\if :{?reviewer_password}
\else
  \echo 'STOP: missing disposable recovery reviewer password'
  \quit 3
\endif
begin;
create role apex_test_recovery_requester with
 login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
 password :'requester_password';
create role apex_test_recovery_reviewer with
 login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
 password :'reviewer_password';
grant connect on database apex_test to
 apex_test_recovery_requester,apex_test_recovery_reviewer;
create schema apex_test_recovery;
revoke all on schema apex_test_recovery from PUBLIC,anon,authenticated;
grant usage on schema apex_test_recovery to
 apex_test_recovery_requester,apex_test_recovery_reviewer;

create table public.btcpay_test_worker_observation_caps (
 intent_id uuid primary key references public.btcpay_test_provider_post_intents(id)
    on delete restrict,
 cap_sha256 text not null unique check(cap_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz not null default clock_timestamp(),
 used_at timestamptz
);
alter table public.btcpay_test_worker_observation_caps enable row level security;
revoke all on public.btcpay_test_worker_observation_caps
 from PUBLIC,anon,authenticated,apex_test_invoice_worker;

-- Original worker reserve/observe functions are deliberately withdrawn:
-- retaining EXECUTE on them would bypass crash recovery approval.
revoke execute on function
 apex_test_worker.worker_reserve_btcpay_test_provider_post(uuid,text,text,bigint,text)
 from apex_test_invoice_worker;
revoke execute on function
 apex_test_worker.worker_observe_btcpay_test_provider_post(uuid,text,text)
 from apex_test_invoice_worker;

create function apex_test_worker.worker_reserve_with_observation_cap(
 p_scope uuid,p_store text,p_order text,p_amount bigint,p_fingerprint text)
returns text language plpgsql security definer set search_path='' as $fn$
declare
 v_intent uuid;
 v_cap text;
begin
 v_intent:=apex_test_worker.worker_reserve_btcpay_test_provider_post(
   p_scope,p_store,p_order,p_amount,p_fingerprint);
 -- Two independent random UUIDs yield a unique, unguessable in-process
 -- capability. Only its SHA256 is stored; a restarted worker cannot fetch it.
 v_cap:=pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')||
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 insert into public.btcpay_test_worker_observation_caps(intent_id,cap_sha256)
 values(v_intent,pg_catalog.encode(pg_catalog.sha256(
   pg_catalog.convert_to(v_cap,'UTF8')),'hex'));
 return pg_catalog.json_build_object(
   'intentId',v_intent,'observationToken',v_cap)::text;
end;
$fn$;

create function apex_test_worker.worker_observe_with_observation_cap(
 p_intent uuid,p_kind text,p_invoice text,p_cap text)
returns text language plpgsql security definer set search_path='' as $fn$
declare
 v_scope uuid;
 v_result text;
begin
 if p_cap is null or p_cap !~ '^[0-9a-f]{64}$' then
   raise exception 'Missing ephemeral observation capability'
     using errcode='55000';
 end if;
 select i.scope_id into v_scope from public.btcpay_test_provider_post_intents i
   where i.id=p_intent;
 if v_scope is null then raise exception 'Unknown invoice intent'
   using errcode='55000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||v_scope::text,0));
 update public.btcpay_test_worker_observation_caps c
 set used_at=clock_timestamp()
 where c.intent_id=p_intent and c.used_at is null
  and c.cap_sha256=pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_cap,'UTF8')),'hex');
 if not found then
   raise exception 'Worker observation capability missing or consumed'
     using errcode='55000';
 end if;
 v_result:=apex_test_internal.observe_btcpay_test_provider_post(
    p_intent,p_kind,p_invoice);
 return v_result;
end;
$fn$;
revoke all on function apex_test_worker.worker_reserve_with_observation_cap(
 uuid,text,text,bigint,text) from PUBLIC,anon,authenticated;
revoke all on function apex_test_worker.worker_observe_with_observation_cap(
 uuid,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function apex_test_worker.worker_reserve_with_observation_cap(
 uuid,text,text,bigint,text) to apex_test_invoice_worker;
grant execute on function apex_test_worker.worker_observe_with_observation_cap(
 uuid,text,text,text) to apex_test_invoice_worker;

create table public.btcpay_test_operator_recovery_requests (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 intent_id uuid not null unique references public.btcpay_test_provider_post_intents(id)
   on delete restrict,
 scope_id uuid not null references public.stores(id) on delete restrict,
 provider_invoice_id text not null check(provider_invoice_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 requested_by text not null check(requested_by='apex_test_recovery_requester'),
 requested_at timestamptz not null default clock_timestamp()
);
create table public.btcpay_test_operator_recovery_approvals (
 request_id uuid primary key references public.btcpay_test_operator_recovery_requests(id)
   on delete restrict,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 approved_by text not null check(approved_by='apex_test_recovery_reviewer'),
 approved_at timestamptz not null default clock_timestamp()
);
alter table public.btcpay_test_operator_recovery_requests enable row level security;
alter table public.btcpay_test_operator_recovery_approvals enable row level security;
revoke all on public.btcpay_test_operator_recovery_requests,
 public.btcpay_test_operator_recovery_approvals
 from PUBLIC,anon,authenticated,apex_test_invoice_worker,
      apex_test_recovery_requester,apex_test_recovery_reviewer;
create trigger btcpay_test_operator_request_immutable
 before update or delete on public.btcpay_test_operator_recovery_requests
 for each row execute function apex_test_internal.block_test_receipt_mutation();
create trigger btcpay_test_operator_approval_immutable
 before update or delete on public.btcpay_test_operator_recovery_approvals
 for each row execute function apex_test_internal.block_test_receipt_mutation();

create function apex_test_recovery.request_verified_provider_readback(
 p_intent uuid,p_invoice text,p_evidence_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare
 v_intent public.btcpay_test_provider_post_intents%rowtype;
 v_req uuid;
begin
 if session_user<>'apex_test_recovery_requester' then
   raise exception 'Recovery requester login required' using errcode='42501';
 end if;
 if p_invoice is null or p_invoice !~ '^[A-Za-z0-9_-]{1,100}$' or
    p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$' then
   raise exception 'Invalid independent provider readback proof'
    using errcode='22023';
 end if;
 select * into v_intent from public.btcpay_test_provider_post_intents
   where id=p_intent;
 if not found then
   raise exception 'Unknown durable provider intent' using errcode='55000';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||v_intent.scope_id::text,0));
 if not exists(
    select 1 from public.btcpay_test_checkout_resume_permits p
     where p.scope_id=v_intent.scope_id
       and p.request_id=v_intent.permit_request_id
       and p.status='consumed'
 ) or not exists(
    select 1 from public.btcpay_test_split_sync_holds h
     where h.scope_id=v_intent.scope_id and h.status='held'
 ) or not exists (
    select 1 from public.btcpay_test_trusted_post_store_bindings b
      where b.scope_id=v_intent.scope_id
        and b.btcpay_store_id=v_intent.btcpay_store_id
        and b.network='regtest'
 ) or exists (
    select 1 from public.btcpay_test_provider_post_observations o
      where o.intent_id=v_intent.id and o.kind='invoice_seen_by_readback'
 ) or exists(
    select 1 from public.btcpay_test_operator_recovery_requests r
      where r.intent_id=v_intent.id
 ) then
   raise exception 'Recovery review denied; stale or already reconciled'
     using errcode='55000';
 end if;
 insert into public.btcpay_test_operator_recovery_requests(
    intent_id,scope_id,provider_invoice_id,evidence_sha256,requested_by)
 values(v_intent.id,v_intent.scope_id,p_invoice,p_evidence_sha256,session_user)
 returning id into v_req;
 return v_req;
end;
$fn$;

create function apex_test_recovery.approve_verified_provider_readback(
 p_request uuid,p_evidence_sha256 text)
returns text language plpgsql security definer set search_path='' as $fn$
declare
 v_request public.btcpay_test_operator_recovery_requests%rowtype;
 v_intent public.btcpay_test_provider_post_intents%rowtype;
begin
 if session_user<>'apex_test_recovery_reviewer' then
   raise exception 'Independent recovery reviewer login required'
     using errcode='42501';
 end if;
 select * into v_request from public.btcpay_test_operator_recovery_requests
    where id=p_request;
 if not found or p_evidence_sha256 is null or
    v_request.evidence_sha256 is distinct from p_evidence_sha256 or
    v_request.requested_by=session_user then
   raise exception 'Independent matching readback evidence required'
     using errcode='55000';
 end if;
 select * into v_intent from public.btcpay_test_provider_post_intents
    where id=v_request.intent_id and scope_id=v_request.scope_id;
 if not found then raise exception 'Provider intent no longer matches review'
     using errcode='55000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||v_intent.scope_id::text,0));
 if not exists (
   select 1 from public.btcpay_test_checkout_resume_permits p
     where p.scope_id=v_intent.scope_id
       and p.request_id=v_intent.permit_request_id
       and p.status='consumed'
 ) or not exists (
   select 1 from public.btcpay_test_split_sync_holds h
     where h.scope_id=v_intent.scope_id and h.status='held'
 ) or exists (
   select 1 from public.btcpay_test_provider_post_observations o
     where o.intent_id=v_intent.id and o.kind='invoice_seen_by_readback'
 ) or exists (
   select 1 from public.btcpay_test_operator_recovery_approvals a
     where a.request_id=v_request.id
 ) then raise exception 'Recovery approval denied; stale or already recorded'
   using errcode='55000'; end if;
 insert into public.btcpay_test_operator_recovery_approvals(
   request_id,evidence_sha256,approved_by)
 values(v_request.id,p_evidence_sha256,session_user);
 perform apex_test_internal.observe_btcpay_test_provider_post(
   v_intent.id,'invoice_seen_by_readback',v_request.provider_invoice_id);
 return 'reconciled_without_checkout_or_retry';
end;
$fn$;
revoke all on function apex_test_recovery.request_verified_provider_readback(
 uuid,text,text) from PUBLIC,anon,authenticated,apex_test_invoice_worker,
 apex_test_recovery_reviewer;
revoke all on function apex_test_recovery.approve_verified_provider_readback(
 uuid,text) from PUBLIC,anon,authenticated,apex_test_invoice_worker,
 apex_test_recovery_requester;
grant execute on function apex_test_recovery.request_verified_provider_readback(
 uuid,text,text) to apex_test_recovery_requester;
grant execute on function apex_test_recovery.approve_verified_provider_readback(
 uuid,text) to apex_test_recovery_reviewer;
commit;
