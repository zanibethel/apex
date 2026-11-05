-- Issue #219: private, owner-only aggregate daily supplier email health.
-- This reports Resend-signed evidence, never unverified inbox placement.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('apex_internal.supplier_daily_report_email_outbox') is null
 or to_regclass('apex_internal.supplier_report_delivery_events') is null
 or to_regprocedure('public.get_admin_daily_mail_sender_readiness(text)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Supplier mail health preflight denied';end if;
end $preflight$;

create function public.get_admin_supplier_mail_delivery_health(
 p_days integer default 7
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_since constant timestamptz:='2026-11-05T13:49:23.380515Z'::timestamptz;
 v jsonb;
begin
 if v_uid is null
 or (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
 or not exists(select 1 from auth.users u
  where u.id=v_uid and u.email_confirmed_at is not null)
 then raise exception 'Verified platform admin required' using errcode='42501';end if;
 if p_days is null or p_days<1 or p_days>30
 then raise exception 'Invalid time range' using errcode='22023';end if;
 with latest as (
  select o.id,o.updated_at,
   e.event_type,e.occurred_at
  from apex_internal.supplier_daily_report_email_outbox o
  left join lateral (
   select ev.event_type,ev.occurred_at
   from apex_internal.supplier_report_delivery_events ev
   where ev.dispatch_id=o.id
   order by ev.occurred_at desc,ev.recorded_at desc,ev.event_id desc
   limit 1
  ) e on true
  where o.state='accepted'
   and o.updated_at>=now()-make_interval(days=>p_days)
 ), counts as (
  select
   count(*)::int as accepted,
   count(*) filter (where updated_at<v_since)::int as predates_webhook,
   count(*) filter (where updated_at>=v_since and event_type is null)::int
    as no_signed_event,
   count(*) filter (where updated_at>=v_since and event_type is null
    and updated_at<now()-interval '3 hours')::int as receipt_overdue,
   count(*) filter (where event_type='email.delivered')::int
    as delivered_to_mail_server,
   count(*) filter (where event_type='email.sent')::int as sent,
   count(*) filter (where event_type='email.delivery_delayed')::int as delayed,
   count(*) filter (where event_type='email.bounced')::int as bounced,
   count(*) filter (where event_type='email.failed')::int as failed,
   count(*) filter (where event_type='email.complained')::int as complained,
   count(*) filter (where event_type='email.suppressed')::int as suppressed,
   max(occurred_at) as latest_signed_event_at
  from latest
 )
 select pg_catalog.jsonb_build_object(
  'schema_version',1,'scope','all_supplier_daily_reports',
  'window_days',p_days,'webhook_started_at',v_since,
  'accepted',accepted,'predates_webhook',predates_webhook,
  'no_signed_event',no_signed_event,'receipt_overdue',receipt_overdue,
  'delivered_to_mail_server',delivered_to_mail_server,
  'sent',sent,'delayed',delayed,'bounced',bounced,
  'failed',failed,'complained',complained,'suppressed',suppressed,
  'latest_signed_event_at',latest_signed_event_at,
  'alert_count',receipt_overdue+delayed+bounced+failed+complained+suppressed,
  'inbox_delivery_confirmed',false,'can_ship',false
 ) into v from counts;
 return v;
end $fn$;
revoke all on function public.get_admin_supplier_mail_delivery_health(integer)
 from public,anon,authenticated;
grant execute on function public.get_admin_supplier_mail_delivery_health(integer)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.get_admin_supplier_mail_delivery_health(integer)','EXECUTE')
 or not has_function_privilege('authenticated',
  'public.get_admin_supplier_mail_delivery_health(integer)','EXECUTE')
 or has_table_privilege('authenticated',
  'apex_internal.supplier_report_delivery_events','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Mail health postflight denied';end if;
end $postflight$;
commit;
