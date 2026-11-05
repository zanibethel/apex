-- Issue #219: provider EVENT evidence for opted-in supplier daily reports.
-- No order/payment/shipment state, no recipient PII, and no commerce activation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if to_regclass('apex_internal.supplier_daily_report_email_outbox') is null
 or to_regprocedure('apex_internal.assert_daily_report_worker_token(text)') is null
 or to_regclass('public.supplier_memberships') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Supplier delivery journal preflight denied'; end if;
end $preflight$;

create table apex_internal.supplier_report_delivery_events(
 event_id text primary key
  check (event_id ~ '^[A-Za-z0-9_-]{8,160}$'),
 dispatch_id uuid not null
  references apex_internal.supplier_daily_report_email_outbox(id)
  on delete restrict,
 provider_email_id text not null
  check (provider_email_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 event_type text not null
  check (event_type in (
   'email.sent','email.delivered','email.bounced',
   'email.complained','email.failed','email.delivery_delayed',
   'email.suppressed'
  )),
 occurred_at timestamptz not null,
 recorded_at timestamptz not null default now()
);
create index apex_supplier_mail_events_dispatch_idx
 on apex_internal.supplier_report_delivery_events(
  dispatch_id,occurred_at desc,recorded_at desc);
alter table apex_internal.supplier_report_delivery_events
 enable row level security;
alter table apex_internal.supplier_report_delivery_events
 force row level security;
revoke all on apex_internal.supplier_report_delivery_events
 from public,anon,authenticated,service_role;
comment on table apex_internal.supplier_report_delivery_events is
 'Provider-signed Resend receipt metadata after server verification. No email addresses, customer data or order/shipping authority.';

-- The web route verifies raw Svix signature before invoking this narrowly
-- scoped token-guarded journal; an event must match exactly one accepted
-- provider ID previously recorded by the supplier daily report sender.
create function public.record_supplier_daily_report_delivery_event(
 p_worker_token text,
 p_event_id text,
 p_provider_email_id text,
 p_event_type text,
 p_occurred_at timestamptz
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_dispatch uuid;
 v_matches integer;
 v_written integer;
 v_prior apex_internal.supplier_report_delivery_events%rowtype;
begin
 perform apex_internal.assert_daily_report_worker_token(p_worker_token);
 if p_event_id is null or p_event_id !~ '^[A-Za-z0-9_-]{8,160}$'
  or p_provider_email_id is null
  or p_provider_email_id !~ '^[A-Za-z0-9_-]{8,128}$'
  or p_event_type is null or p_event_type not in (
   'email.sent','email.delivered','email.bounced',
   'email.complained','email.failed','email.delivery_delayed',
   'email.suppressed'
  )
  or p_occurred_at is null or p_occurred_at > now()+interval '5 minutes'
  or p_occurred_at < now()-interval '90 days'
 then raise exception 'Invalid provider receipt' using errcode='22023';
 end if;
 select count(*),min(o.id) into v_matches,v_dispatch
 from apex_internal.supplier_daily_report_email_outbox o
 where o.provider_email_id=p_provider_email_id and o.state='accepted';
 if v_matches<>1 then
  raise exception 'Unknown or ambiguous supplier report message'
   using errcode='42501';
 end if;
 insert into apex_internal.supplier_report_delivery_events(
  event_id,dispatch_id,provider_email_id,event_type,occurred_at
 ) values (
  p_event_id,v_dispatch,p_provider_email_id,p_event_type,p_occurred_at
 ) on conflict(event_id) do nothing;
 get diagnostics v_written=row_count;
 if v_written=0 then
  select * into v_prior
   from apex_internal.supplier_report_delivery_events e
   where e.event_id=p_event_id;
  if v_prior.dispatch_id is distinct from v_dispatch
   or v_prior.provider_email_id is distinct from p_provider_email_id
   or v_prior.event_type is distinct from p_event_type
   or v_prior.occurred_at is distinct from p_occurred_at
  then raise exception 'Provider receipt replay conflict'
    using errcode='23505';
  end if;
 end if;
 return pg_catalog.jsonb_build_object(
  'schema_version',1,
  'recorded',v_written=1,
  'duplicate',v_written=0
 );
end $fn$;
revoke all on function public.record_supplier_daily_report_delivery_event(
 text,text,text,text,timestamptz) from public,anon,authenticated;
-- Existing reporter uses a server-held 256-bit token with the publishable key.
-- The webhook route additionally checks the independent Resend signature.
grant execute on function public.record_supplier_daily_report_delivery_event(
 text,text,text,text,timestamptz) to anon;

create function public.get_supplier_daily_report_delivery_status(
 p_store_id uuid,p_report_date date
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_dispatch uuid;
 v_event text;
 v_occurred timestamptz;
 v_state text:='not_sent';
begin
 if v_uid is null or
  coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=true
  or p_store_id is null or p_report_date is null
  or p_report_date > (now() at time zone 'America/Chicago')::date
  or p_report_date < (now() at time zone 'America/Chicago')::date-400
  or not exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
  )
 then raise exception 'Supplier report access denied'
   using errcode='42501';
 end if;
 select o.id into v_dispatch
 from apex_internal.supplier_daily_report_email_outbox o
 where o.store_id=p_store_id and o.user_id=v_uid
  and o.report_date=p_report_date and o.state='accepted';
 if v_dispatch is not null then
  v_state:='provider_accepted';
  select e.event_type,e.occurred_at into v_event,v_occurred
   from apex_internal.supplier_report_delivery_events e
   where e.dispatch_id=v_dispatch
   order by e.occurred_at desc,e.recorded_at desc,e.event_id desc
   limit 1;
  if v_event is not null then
   v_state:=case v_event
    when 'email.sent' then 'provider_sent'
    when 'email.delivered' then 'provider_delivered'
    when 'email.bounced' then 'provider_bounced'
    when 'email.complained' then 'provider_complained'
    when 'email.failed' then 'provider_failed'
    when 'email.delivery_delayed' then 'provider_delayed'
    when 'email.suppressed' then 'provider_suppressed'
    else 'provider_accepted' end;
  end if;
 end if;
 return pg_catalog.jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'report_date',p_report_date,'state',v_state,
  'provider_accepted',v_dispatch is not null,
  'provider_event_type',v_event,'provider_event_at',v_occurred,
  'inbox_delivery_confirmed',false,'can_ship',false
 );
end $fn$;
revoke all on function public.get_supplier_daily_report_delivery_status(
 uuid,date) from public,anon,authenticated;
grant execute on function public.get_supplier_daily_report_delivery_status(
 uuid,date) to authenticated;

do $postflight$
begin
 if has_table_privilege('anon',
  'apex_internal.supplier_report_delivery_events','SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.supplier_report_delivery_events','INSERT')
  or has_function_privilege('anon',
   'public.get_supplier_daily_report_delivery_status(uuid,date)','EXECUTE')
  or not has_function_privilege('anon',
   'public.record_supplier_daily_report_delivery_event(text,text,text,text,timestamptz)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Supplier delivery journal postflight denied'; end if;
end $postflight$;
commit;
