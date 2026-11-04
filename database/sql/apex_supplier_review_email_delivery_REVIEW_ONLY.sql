-- Issue #217 Phase 1: synthetic email delivery/attachment manifest outbox.
-- ONLY apex_test; no production migration, Resend request, email recipient
-- address disclosure, customer PII, payment, label or shipping operation.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or to_regclass('apex_internal.supplier_daily_report_email_subscriptions') is null
  or to_regclass('apex_internal.supplier_review_annotations') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Synthetic email manifest requires gated disposable DB';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table apex_internal.supplier_review_email_manifests (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 report_day date not null,
 recipient_user_id uuid not null references auth.users(id) on delete restrict,
 attachment_sha256 text not null check(attachment_sha256 ~ '^[0-9a-f]{64}$'),
 attachment_bytes integer not null check(attachment_bytes between 1 and 400000),
 original_order_count integer not null check(original_order_count between 0 and 100),
 attachment_row_count integer not null check(attachment_row_count between 0 and 1000),
 state text not null default 'prepared' check(state in (
  'prepared','simulated_accepted','simulated_delivered','simulated_failed')),
 attempt_count integer not null default 1 check(attempt_count between 1 and 5),
 revision integer not null default 1 check(revision between 1 and 20),
 simulated_provider_id text,
 last_failure_code text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(store_id,report_day,recipient_user_id),
 check (
  (state='prepared' and simulated_provider_id is null and last_failure_code is null)
  or (state in ('simulated_accepted','simulated_delivered')
   and simulated_provider_id ~ '^[A-Za-z0-9_-]{8,128}$'
   and last_failure_code is null)
  or (state='simulated_failed'
   and last_failure_code in ('synthetic_timeout','synthetic_bounce','synthetic_rejected'))
 ),
 check(report_day<=current_date)
);
create table apex_internal.supplier_review_email_events (
 event_id uuid primary key,
 manifest_id uuid not null
  references apex_internal.supplier_review_email_manifests(id) on delete restrict,
 store_id uuid not null,
 report_day date not null,
 recipient_user_id uuid not null,
 event_kind text not null check(event_kind in (
  'prepared','retry_prepared','simulated_accepted',
  'simulated_delivered','simulated_failed')),
 before_revision integer not null,
 after_revision integer not null,
 simulated_provider_id text,
 failure_code text,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(manifest_id,after_revision),
 check(after_revision=before_revision+1)
);
create trigger review_email_events_immutable
 before update or delete on apex_internal.supplier_review_email_events
 for each row execute function apex_internal.deny_order_detail_mutation();
alter table apex_internal.supplier_review_email_manifests enable row level security;
alter table apex_internal.supplier_review_email_manifests force row level security;
alter table apex_internal.supplier_review_email_events enable row level security;
alter table apex_internal.supplier_review_email_events force row level security;
revoke all on apex_internal.supplier_review_email_manifests,
 apex_internal.supplier_review_email_events from public,anon,authenticated;
do $restricted$
begin
 if to_regrole('service_role') is not null then
  execute 'revoke all on apex_internal.supplier_review_email_manifests,
    apex_internal.supplier_review_email_events from service_role';
 end if;
end $restricted$;

-- Private admin-only synthetic preparation. Does not accept a destination
-- email address; it rechecks opt-in and confirmed current user identity.
create function apex_internal.prepare_review_email_manifest(
 p_store uuid,p_day date,p_user uuid,p_event_id uuid,
 p_digest text,p_bytes integer,p_orders integer,p_rows integer)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v apex_internal.supplier_review_email_manifests%rowtype;
 v_state text;
begin
 if current_database()<>'apex_test'
 or p_store is null or p_day is null or p_day>current_date
 or p_day<current_date-7 or p_user is null or p_event_id is null
 or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
 or p_bytes is null or p_bytes not between 1 and 400000
 or p_orders is null or p_orders not between 0 and 100
 or p_rows is null or p_rows not between 0 and 1000
 or p_rows<p_orders
 or not exists(
  select 1 from apex_internal.supplier_daily_report_email_subscriptions sub
  join public.stores s on s.id=sub.store_id
  join public.supplier_memberships m
   on m.supplier_id=s.supplier_id and m.user_id=sub.user_id
  join auth.users u on u.id=sub.user_id
  where sub.store_id=p_store and sub.user_id=p_user
   and sub.enabled=true
   and u.email_confirmed_at is not null
   and length(btrim(coalesce(u.email,''))) between 3 and 254
 )
 then raise exception 'Verified opted-in review recipient required'
  using errcode='42501';end if;
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Review email gate denied'
  using errcode='42501';end if;
 perform 1 from public.stores where id=p_store for update;
 if not found then raise exception 'Review store unavailable'
  using errcode='42501';end if;

 select * into v from apex_internal.supplier_review_email_manifests
 where store_id=p_store and report_day=p_day
  and recipient_user_id=p_user for update;
 if not found then
  insert into apex_internal.supplier_review_email_manifests(
   store_id,report_day,recipient_user_id,attachment_sha256,
   attachment_bytes,original_order_count,attachment_row_count)
  values(p_store,p_day,p_user,p_digest,p_bytes,p_orders,p_rows)
  returning * into v;
  insert into apex_internal.supplier_review_email_events(
   event_id,manifest_id,store_id,report_day,recipient_user_id,
   event_kind,before_revision,after_revision)
  values(p_event_id,v.id,p_store,p_day,p_user,'prepared',0,1);
  v_state:='prepared';
 else
  if v.attachment_sha256<>p_digest or v.attachment_bytes<>p_bytes
   or v.original_order_count<>p_orders or v.attachment_row_count<>p_rows
  then raise exception 'Changed cumulative report cannot reuse day identity'
   using errcode='23505';end if;
  if exists(select 1 from apex_internal.supplier_review_email_events
   where event_id=p_event_id and manifest_id=v.id)
  then v_state:='identical_replay';
  elsif v.state='simulated_failed' and v.attempt_count<5 then
   update apex_internal.supplier_review_email_manifests
   set state='prepared',attempt_count=attempt_count+1,
    revision=revision+1,last_failure_code=null,
    simulated_provider_id=null,updated_at=clock_timestamp()
   where id=v.id returning * into v;
   insert into apex_internal.supplier_review_email_events(
    event_id,manifest_id,store_id,report_day,recipient_user_id,
    event_kind,before_revision,after_revision)
   values(p_event_id,v.id,p_store,p_day,p_user,
    'retry_prepared',v.revision-1,v.revision);
   v_state:='retry_prepared';
  else
   v_state:='already_prepared';
  end if;
 end if;
 return jsonb_build_object(
  'schema_version',1,'manifest_id',v.id,'store_id',p_store,
  'report_day',p_day,'outcome',v_state,'state',v.state,
  'attempt_count',v.attempt_count,'revision',v.revision,
  'transport_mode','synthetic_only','mail_sent',false,
  'inbox_delivered',false,'shipping_modified',false);
end $fn$;
revoke all on function apex_internal.prepare_review_email_manifest(
 uuid,date,uuid,uuid,text,integer,integer,integer)
 from public,anon,authenticated;

-- Simulated provider events only. Never called by a public webhook.
create function apex_internal.record_review_email_simulated_event(
 p_manifest uuid,p_event uuid,p_expected_revision integer,
 p_kind text,p_provider_id text default null,p_failure text default null)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare v apex_internal.supplier_review_email_manifests%rowtype;
 v_old apex_internal.supplier_review_email_events%rowtype;
 v_new_state text;
begin
 if current_database()<>'apex_test' or p_manifest is null
  or p_event is null or p_expected_revision is null
  or p_expected_revision not between 1 and 19
  or p_kind not in ('simulated_accepted','simulated_delivered','simulated_failed')
 then raise exception 'Invalid simulated provider event'
  using errcode='23514';end if;
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Review delivery gate denied'
  using errcode='42501';end if;
 select * into v from apex_internal.supplier_review_email_manifests
  where id=p_manifest for update;
 if not found then raise exception 'Unknown review email manifest'
  using errcode='42501';end if;
 select * into v_old from apex_internal.supplier_review_email_events
  where event_id=p_event;
 if found then
  if v_old.manifest_id<>p_manifest or v_old.event_kind<>p_kind
   or v_old.before_revision<>p_expected_revision
   or v_old.simulated_provider_id is distinct from p_provider_id
   or v_old.failure_code is distinct from p_failure
  then raise exception 'Conflicting synthetic event replay'
   using errcode='23505';end if;
  return jsonb_build_object('outcome','identical_replay',
   'state',v.state,'revision',v.revision,'mail_sent',false,
   'transport_mode','synthetic_only');
 end if;
 if v.revision<>p_expected_revision then
  raise exception 'Stale review delivery revision'
   using errcode='40001';end if;
 if p_kind='simulated_accepted' then
  if v.state<>'prepared' or p_failure is not null
   or p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{8,128}$'
  then raise exception 'Invalid synthetic acceptance transition'
   using errcode='23514';end if;
  v_new_state:='simulated_accepted';
 elsif p_kind='simulated_delivered' then
  if v.state<>'simulated_accepted'
   or p_provider_id is distinct from v.simulated_provider_id
   or p_failure is not null
  then raise exception 'Acceptance is not final delivery'
   using errcode='23514';end if;
  v_new_state:='simulated_delivered';
 else
  if v.state not in ('prepared','simulated_accepted')
   or p_failure not in (
    'synthetic_timeout','synthetic_bounce','synthetic_rejected')
  then raise exception 'Invalid simulated failure transition'
   using errcode='23514';end if;
  if v.state='simulated_accepted'
   and p_provider_id is distinct from v.simulated_provider_id
  then raise exception 'Provider identity mismatch'
   using errcode='23514';end if;
  if v.state='prepared' and p_provider_id is not null
  then raise exception 'Failure cannot invent provider acceptance'
   using errcode='23514';end if;
  v_new_state:='simulated_failed';
 end if;
 update apex_internal.supplier_review_email_manifests
 set state=v_new_state,revision=revision+1,
  simulated_provider_id=case
   when v_new_state='simulated_failed' then v.simulated_provider_id
   else p_provider_id end,
  last_failure_code=p_failure,
  updated_at=clock_timestamp()
 where id=p_manifest returning * into v;
 insert into apex_internal.supplier_review_email_events(
  event_id,manifest_id,store_id,report_day,recipient_user_id,event_kind,
  before_revision,after_revision,simulated_provider_id,failure_code)
 values(p_event,v.id,v.store_id,v.report_day,v.recipient_user_id,
  p_kind,v.revision-1,v.revision,p_provider_id,p_failure);
 return jsonb_build_object('outcome','recorded',
  'state',v.state,'revision',v.revision,
  'mail_sent',false,'transport_mode','synthetic_only');
end $fn$;
revoke all on function apex_internal.record_review_email_simulated_event(
 uuid,uuid,integer,text,text,text) from public,anon,authenticated;

-- Authenticated member sees ONLY their own, synthetic preview status.
create function public.get_supplier_review_email_status(
 p_store uuid,p_day date)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v apex_internal.supplier_review_email_manifests%rowtype;
begin
 if current_database()<>'apex_test' or p_store is null or p_day is null
 or v_uid is null
 or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
 or not exists(
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store and m.user_id=v_uid)
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Recipient-scoped preview status denied'
  using errcode='42501';end if;
 select * into v from apex_internal.supplier_review_email_manifests
 where store_id=p_store and report_day=p_day
  and recipient_user_id=v_uid;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store,'report_day',p_day,
  'state',case when v.id is null then 'not_prepared' else v.state end,
  'attempt_count',coalesce(v.attempt_count,0),
  'attachment_available_in_dashboard',true,
  'transport_mode','synthetic_only',
  'real_provider_accepted',false,'real_inbox_delivered',false,
  'mail_sent',false,'shipping_modified',false);
end $fn$;
revoke all on function public.get_supplier_review_email_status(
 uuid,date) from public,anon,authenticated;
grant execute on function public.get_supplier_review_email_status(
 uuid,date) to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_supplier_review_email_status(uuid,date)','EXECUTE')
 or has_function_privilege('authenticated',
   'apex_internal.prepare_review_email_manifest(uuid,date,uuid,uuid,text,integer,integer,integer)','EXECUTE')
 or has_table_privilege('authenticated',
   'apex_internal.supplier_review_email_events','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Synthetic review email grant postflight failed';end if;
end $postflight$;
commit;
