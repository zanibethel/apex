-- Apex Track 3 / #219: daily OWNER-only reporting alert dispatch.
-- Provider evidence is restricted to verified supplier report events.
-- No customer records, order state, shipping or checkout privileges.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.supplier_daily_report_email_outbox') is null
 or to_regclass('apex_internal.supplier_report_delivery_events') is null
 or to_regclass('apex_internal.supplier_report_mail_worker_tokens') is null
 or to_regprocedure('apex_internal.assert_daily_report_worker_token(text)') is null
 or to_regprocedure('public.get_admin_supplier_mail_delivery_health(integer)') is null
 or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Owner mail alert dispatch preflight denied';end if;
end $preflight$;

create table apex_internal.owner_mail_health_alert_outbox(
 report_day date primary key,
 state text not null default 'claimed' check (state in ('claimed','accepted')),
 alert_summary jsonb not null
  check (jsonb_typeof(alert_summary)='object'),
 first_claimed_at timestamptz not null default now(),
 lease_expires_at timestamptz,
 attempt_count int not null default 0 check (attempt_count between 0 and 4),
 provider_email_id text
  check(provider_email_id is null or provider_email_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 accepted_at timestamptz,
 updated_at timestamptz not null default now(),
 check ((state='claimed' and provider_email_id is null and accepted_at is null)
   or (state='accepted' and provider_email_id is not null and accepted_at is not null))
);
alter table apex_internal.owner_mail_health_alert_outbox enable row level security;
alter table apex_internal.owner_mail_health_alert_outbox force row level security;
revoke all on apex_internal.owner_mail_health_alert_outbox
 from public,anon,authenticated;
comment on table apex_internal.owner_mail_health_alert_outbox is
 'Private deduplication and provider-acceptance journal for owner-only aggregate mail health alerts. No recipients, orders or customer data.';

create function public.claim_owner_mail_health_alert(
 p_worker_token text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
declare
 v_day date:=(now() at time zone 'America/Chicago')::date;
 v_since constant timestamptz:='2026-11-05T13:49:23.380515Z'::timestamptz;
 v_counts jsonb;
 v_total int;
 v_row apex_internal.owner_mail_health_alert_outbox%rowtype;
begin
 perform apex_internal.assert_daily_report_worker_token(p_worker_token);
 -- Fixed seven-day bounded aggregation. It cannot reveal per-supplier,
 -- per-recipient, provider message IDs, raw bodies or personal data.
 with latest as (
  select o.id,o.updated_at,e.event_type
  from apex_internal.supplier_daily_report_email_outbox o
  left join lateral (
   select ev.event_type
   from apex_internal.supplier_report_delivery_events ev
   where ev.dispatch_id=o.id
   order by ev.occurred_at desc,ev.recorded_at desc,ev.event_id desc
   limit 1
  ) e on true
  where o.state='accepted' and o.updated_at>=now()-interval '7 days'
 ), counts as (
  select
   count(*)::int accepted,
   count(*) filter(where updated_at<v_since)::int predates_webhook,
   count(*) filter(where updated_at>=v_since and event_type is null
    and updated_at<now()-interval '3 hours')::int receipt_overdue,
   count(*) filter(where event_type='email.delivery_delayed')::int delayed,
   count(*) filter(where event_type='email.bounced')::int bounced,
   count(*) filter(where event_type='email.failed')::int failed,
   count(*) filter(where event_type='email.complained')::int complained,
   count(*) filter(where event_type='email.suppressed')::int suppressed
  from latest
 )
 select pg_catalog.jsonb_build_object(
  'accepted',accepted,'predates_webhook',predates_webhook,
  'receipt_overdue',receipt_overdue,'delayed',delayed,
  'bounced',bounced,'failed',failed,'complained',complained,
  'suppressed',suppressed,
  'alert_count',receipt_overdue+delayed+bounced+failed+complained+suppressed
 ) into v_counts from counts;
 v_total:=(v_counts->>'alert_count')::integer;
 if v_total=0 then
  return jsonb_build_object('schema_version',1,'state','no_alerts',
   'report_date',v_day);
 end if;
 -- A frozen daily snapshot prevents Resend 409s from retrying the same key
 -- with different content. The real recipient comes ONLY from the
 -- preconfigured owner-domain server variable, never client input.
 insert into apex_internal.owner_mail_health_alert_outbox(
  report_day,alert_summary)
 values(v_day,v_counts)
 on conflict(report_day) do nothing;
 select * into v_row
 from apex_internal.owner_mail_health_alert_outbox
 where report_day=v_day for update skip locked;
 if not found or v_row.state='accepted'
  or (v_row.lease_expires_at is not null and v_row.lease_expires_at>now())
  or v_row.attempt_count>=4
  or now()>v_row.first_claimed_at+interval '12 hours'
 then
  return jsonb_build_object('schema_version',1,'state','not_claimed',
   'report_date',v_day);
 end if;
 update apex_internal.owner_mail_health_alert_outbox
 set lease_expires_at=now()+interval '15 minutes',
  attempt_count=attempt_count+1,updated_at=now()
 where report_day=v_day;
 return jsonb_build_object('schema_version',1,'state','claimed',
  'report_date',v_day,'summary',v_row.alert_summary);
end $fn$;
revoke all on function public.claim_owner_mail_health_alert(text)
 from public,anon,authenticated;
grant execute on function public.claim_owner_mail_health_alert(text) to anon;

create function public.accept_owner_mail_health_alert(
 p_worker_token text,p_report_day date,p_provider_email_id text
) returns boolean language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
declare v_count integer;
begin
 perform apex_internal.assert_daily_report_worker_token(p_worker_token);
 if p_report_day is null
  or p_report_day is distinct from (now() at time zone 'America/Chicago')::date
  or p_provider_email_id is null
  or p_provider_email_id !~ '^[A-Za-z0-9_-]{8,128}$'
 then raise exception 'Invalid owner alert acknowledgement' using errcode='22023';end if;
 update apex_internal.owner_mail_health_alert_outbox
 set state='accepted',provider_email_id=p_provider_email_id,
  accepted_at=now(),lease_expires_at=null,updated_at=now()
 where report_day=p_report_day and state='claimed'
  and lease_expires_at is not null and lease_expires_at>=now();
 get diagnostics v_count=row_count;
 return v_count=1;
end $fn$;
revoke all on function public.accept_owner_mail_health_alert(text,date,text)
 from public,anon,authenticated;
grant execute on function public.accept_owner_mail_health_alert(text,date,text) to anon;

do $postflight$
begin
 if has_table_privilege('anon',
   'apex_internal.owner_mail_health_alert_outbox','SELECT')
 or has_table_privilege('authenticated',
   'apex_internal.owner_mail_health_alert_outbox','UPDATE')
 or has_function_privilege('authenticated',
   'public.claim_owner_mail_health_alert(text)','EXECUTE')
 or has_function_privilege('anon',
   'public.get_admin_supplier_mail_delivery_health(integer)','EXECUTE')
 or not has_function_privilege('anon',
   'public.accept_owner_mail_health_alert(text,date,text)','EXECUTE')
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Owner mail alert dispatch postflight denied';end if;
end $postflight$;
commit;
