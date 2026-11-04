-- PR #210: supplier-paid USPS connection readiness and pre-8 AM Central
-- daily order-report snapshots. Zero label purchases, emails, or payments.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.stores') is null
  or to_regclass('public.supplier_memberships') is null
  or to_regclass('public.supplier_sales_history') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Supplier fulfillment/reporting preflight denied';end if;
end $preflight$;

create table apex_internal.supplier_usps_connections (
 store_id uuid primary key references public.stores(id) on delete restrict,
 connection_status text not null default 'not_connected'
  check(connection_status in ('not_connected','pending_authorization','verified')),
 merchant_authorization_reference text,
 verified_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint verified_usps_requires_authorization check (
  (connection_status='verified' and verified_at is not null
   and length(btrim(coalesce(merchant_authorization_reference,''))) between 8 and 180)
  or (connection_status<>'verified' and verified_at is null)
 )
);
alter table apex_internal.supplier_usps_connections enable row level security;
alter table apex_internal.supplier_usps_connections force row level security;
revoke all on apex_internal.supplier_usps_connections from public,anon,authenticated;
comment on table apex_internal.supplier_usps_connections is
 'Supplier USPS authorization metadata only, never OAuth tokens or payment details. No label purchase route in PR210.';

create table apex_internal.supplier_daily_order_reports (
 store_id uuid not null references public.stores(id) on delete restrict,
 report_date date not null,
 report_timezone text not null default 'America/Chicago'
  check (report_timezone='America/Chicago'),
 recorded_order_count integer not null default 0 check(recorded_order_count>=0),
 pending_order_count integer not null default 0 check(pending_order_count>=0),
 confirmed_order_count integer not null default 0 check(confirmed_order_count>=0),
 refunded_order_count integer not null default 0 check(refunded_order_count>=0),
 cancelled_order_count integer not null default 0 check(cancelled_order_count>=0),
 pending_gross_cents bigint not null default 0 check(pending_gross_cents>=0),
 confirmed_gross_cents bigint not null default 0 check(confirmed_gross_cents>=0),
 refunded_gross_cents bigint not null default 0 check(refunded_gross_cents>=0),
 confirmed_btc_sats bigint not null default 0 check(confirmed_btc_sats>=0),
 generated_at timestamptz not null default now(),
 primary key(store_id,report_date)
);
alter table apex_internal.supplier_daily_order_reports enable row level security;
alter table apex_internal.supplier_daily_order_reports force row level security;
revoke all on apex_internal.supplier_daily_order_reports from public,anon,authenticated;
create index apex_supplier_sales_daily_date_idx on public.supplier_sales_history(store_id,occurred_at);
comment on table apex_internal.supplier_daily_order_reports is
 'Server-only previous Central calendar day snapshot from verified supplier_sales_history, not estimates or payout statements.';

-- Internal scheduler entry point, invoked only by privileged PostgreSQL cron role.
-- Caller cannot provide a report date or impersonate a supplier.
create function apex_internal.refresh_supplier_daily_order_reports()
 returns integer language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_date date:=(now() at time zone 'America/Chicago')::date-1;
 v_count integer:=0;
begin
 insert into apex_internal.supplier_daily_order_reports(
  store_id,report_date,recorded_order_count,pending_order_count,
  confirmed_order_count,refunded_order_count,cancelled_order_count,
  pending_gross_cents,confirmed_gross_cents,refunded_gross_cents,
  confirmed_btc_sats,generated_at
 )
 select s.id,v_date,count(h.id)::integer,
  count(h.id) filter(where h.sale_state='pending')::integer,
  count(h.id) filter(where h.sale_state='confirmed')::integer,
  count(h.id) filter(where h.sale_state='refunded')::integer,
  count(h.id) filter(where h.sale_state='cancelled')::integer,
  coalesce(sum(h.gross_cents) filter(where h.sale_state='pending'),0)::bigint,
  coalesce(sum(h.gross_cents) filter(where h.sale_state='confirmed'),0)::bigint,
  coalesce(sum(h.gross_cents) filter(where h.sale_state='refunded'),0)::bigint,
  coalesce(sum(h.confirmed_btc_sats) filter(where h.sale_state='confirmed'),0)::bigint,
  now()
 from public.stores s
 left join public.supplier_sales_history h on h.store_id=s.id
  and h.occurred_at>=((v_date::timestamp at time zone 'America/Chicago'))
  and h.occurred_at<(((v_date+1)::timestamp) at time zone 'America/Chicago')
 group by s.id
 on conflict(store_id,report_date) do update set
  recorded_order_count=excluded.recorded_order_count,
  pending_order_count=excluded.pending_order_count,
  confirmed_order_count=excluded.confirmed_order_count,
  refunded_order_count=excluded.refunded_order_count,
  cancelled_order_count=excluded.cancelled_order_count,
  pending_gross_cents=excluded.pending_gross_cents,
  confirmed_gross_cents=excluded.confirmed_gross_cents,
  refunded_gross_cents=excluded.refunded_gross_cents,
  confirmed_btc_sats=excluded.confirmed_btc_sats,
  generated_at=excluded.generated_at;
 get diagnostics v_count=row_count;
 return v_count;
end $fn$;
revoke all on function apex_internal.refresh_supplier_daily_order_reports()
 from public,anon,authenticated;

create function public.get_supplier_daily_order_report(
 p_store_id uuid,p_report_date date
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_r apex_internal.supplier_daily_order_reports%rowtype;
begin
 if (select auth.uid()) is null
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=(select auth.uid())
  ) then raise exception 'Supplier membership required' using errcode='42501';end if;
 if p_report_date is null
  or p_report_date>(now() at time zone 'America/Chicago')::date
  or p_report_date<((now() at time zone 'America/Chicago')::date-400)
 then raise exception 'Invalid report date' using errcode='22023';end if;
 select * into v_r from apex_internal.supplier_daily_order_reports
 where store_id=p_store_id and report_date=p_report_date;
 if not found then
  return jsonb_build_object('schema_version',1,'status','not_generated',
   'store_id',p_store_id,'report_date',p_report_date,
   'time_zone','America/Chicago');
 end if;
 return jsonb_build_object(
  'schema_version',1,'status','generated',
  'store_id',v_r.store_id,'report_date',v_r.report_date,
  'time_zone',v_r.report_timezone,'generated_at',v_r.generated_at,
  'recorded_order_count',v_r.recorded_order_count,
  'pending_order_count',v_r.pending_order_count,
  'confirmed_order_count',v_r.confirmed_order_count,
  'refunded_order_count',v_r.refunded_order_count,
  'cancelled_order_count',v_r.cancelled_order_count,
  'pending_gross_cents',v_r.pending_gross_cents::text,
  'confirmed_gross_cents',v_r.confirmed_gross_cents::text,
  'refunded_gross_cents',v_r.refunded_gross_cents::text,
  'confirmed_btc_sats',v_r.confirmed_btc_sats::text,
  'email_delivered',false);
end $fn$;
revoke all on function public.get_supplier_daily_order_report(uuid,date)
 from public,anon,authenticated;
grant execute on function public.get_supplier_daily_order_report(uuid,date)
 to authenticated;

create function public.get_supplier_usps_readiness(p_store_id uuid)
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_status text;
begin
 if (select auth.uid()) is null
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=(select auth.uid())
  ) then raise exception 'Supplier membership required' using errcode='42501';end if;
 select connection_status into v_status
 from apex_internal.supplier_usps_connections where store_id=p_store_id;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'connection_status',coalesce(v_status,'not_connected'),
  'postage_payer','supplier',
  'can_purchase_label',false,'tracking_sync_enabled',false,
  'account_authorization_required',true);
end $fn$;
revoke all on function public.get_supplier_usps_readiness(uuid)
 from public,anon,authenticated;
grant execute on function public.get_supplier_usps_readiness(uuid)
 to authenticated;

do $postflight$
begin
 if has_table_privilege('anon','apex_internal.supplier_daily_order_reports','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_daily_order_reports','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_usps_connections','UPDATE')
  or has_function_privilege('anon','public.get_supplier_daily_order_report(uuid,date)','EXECUTE')
  or has_function_privilege('anon','public.get_supplier_usps_readiness(uuid)','EXECUTE')
  or has_function_privilege('authenticated','apex_internal.refresh_supplier_daily_order_reports()','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Supplier reporting/USPS postflight denied';end if;
end $postflight$;
commit;
