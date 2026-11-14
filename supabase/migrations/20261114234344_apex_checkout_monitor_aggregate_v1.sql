-- Mirrors migration applied to Apex Supabase as version 20261114234344.
-- Aggregate-only monitoring, no checkout activation or customer mutations.
-- Returns only aggregate health telemetry. Never grants direct table access.
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create role apex_checkout_monitor nologin noinherit;
create or replace function apex_internal.checkout_monitor_snapshot_v1()
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $fn$
select jsonb_build_object(
 'gate_rows',(select count(*) from apex_internal.retail_order_engine_gate),
 'enabled_gates',(select count(*) from apex_internal.retail_order_engine_gate where enabled),
 'overdue_holds',(select count(*) from apex_internal.retail_order_holds where state='held_no_payment' and expires_at<now()-interval '3 minutes'),
 'stale_envelopes',(select count(*) from apex_internal.retail_order_delivery_envelopes e join apex_internal.retail_order_holds h on h.id=e.order_id and h.store_id=e.store_id where h.state in ('cancelled_no_payment','expired_no_payment') and h.ended_at<now()-interval '75 minutes'),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active,'username',j.username,
   'last_success',(select max(d.end_time) from cron.job_run_details d where d.jobid=j.jobid and d.status='succeeded' and d.start_time>=now()-interval '1 day'),
   'recent_failures',(select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time>=now()-interval '30 minutes' and d.status not in ('succeeded','running'))))
 from cron.job j where j.jobname in ('apex-retail-unpaid-holds-expire-v1','apex-retail-delivery-purge-v1')), '[]'::jsonb)
);
$fn$;
revoke all on function apex_internal.checkout_monitor_snapshot_v1() from public, anon, authenticated, service_role;
grant usage on schema apex_internal to apex_checkout_monitor;
grant execute on function apex_internal.checkout_monitor_snapshot_v1() to apex_checkout_monitor;
-- Operator follow-up: provision a distinct LOGIN role with an independently
-- generated secret and grant it apex_checkout_monitor. Do not store secrets in SQL,
-- source control, or CI logs. Validate negative privilege tests before rollout.
