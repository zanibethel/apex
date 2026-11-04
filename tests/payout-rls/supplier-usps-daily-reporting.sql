-- PR #210: isolated role/scoping, daily sales count and no USPS expenditures.
\set ON_ERROR_STOP on
do $guard$
begin
 if has_table_privilege('anon','apex_internal.supplier_daily_order_reports','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_daily_order_reports','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_usps_connections','UPDATE')
  or has_function_privilege('anon','public.get_supplier_daily_order_report(uuid,date)','EXECUTE')
  or has_function_privilege('anon','public.get_supplier_usps_readiness(uuid)','EXECUTE')
  or has_function_privilege('authenticated',
    'apex_internal.refresh_supplier_daily_order_reports()','EXECUTE')
 then raise exception 'Supplier reporting grants invalid';end if;
end $guard$;

begin;
insert into public.supplier_memberships(supplier_id,user_id,role)
 values('61000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','owner')
 on conflict do nothing;
-- Count the previous Central day. Status and money are historical records.
insert into public.supplier_sales_history(store_id,order_reference,sale_state,
 gross_cents,currency,confirmed_btc_sats,occurred_at)
values('62000000-0000-0000-0000-000000000001',
 'SYNTH-REPORT-210','confirmed',7500,'USD',12000,
 ((now() at time zone 'America/Chicago')::date-1)::timestamp
 at time zone 'America/Chicago');
do $generate$
declare n integer; v record;
begin
 n:=apex_internal.refresh_supplier_daily_order_reports();
 if n<1 then raise exception 'No report snapshots generated';end if;
 select * into v from apex_internal.supplier_daily_order_reports
 where store_id='62000000-0000-0000-0000-000000000001'
 and report_date=(now() at time zone 'America/Chicago')::date-1;
 if not found or v.recorded_order_count<>1 or v.confirmed_order_count<>1
  or v.confirmed_gross_cents<>7500 or v.confirmed_btc_sats<>12000
 then raise exception 'Daily snapshot did not reconcile history';end if;
 n:=apex_internal.refresh_supplier_daily_order_reports();
 if (select count(*) from apex_internal.supplier_daily_order_reports
  where store_id='62000000-0000-0000-0000-000000000001')<>1
 then raise exception 'Duplicate snapshot created on retry';end if;
end $generate$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $supplier$
declare v jsonb; r jsonb;
begin
 v:=public.get_supplier_daily_order_report(
 '62000000-0000-0000-0000-000000000001',
 (now() at time zone 'America/Chicago')::date-1);
 if v->>'status'<>'generated' or v->>'recorded_order_count'<>'1'
  or v->>'confirmed_gross_cents'<>'7500'
  or v->>'email_delivered'<>'false'
 then raise exception 'Verified report readback invalid';end if;
 r:=public.get_supplier_usps_readiness(
  '62000000-0000-0000-0000-000000000001');
 if r->>'connection_status'<>'not_connected'
  or r->>'postage_payer'<>'supplier'
  or r->>'can_purchase_label'<>'false'
  or r->>'tracking_sync_enabled'<>'false'
 then raise exception 'Supplier account readiness breached';end if;
end $supplier$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $other$
declare blocked boolean:=false;
begin
 begin
  perform public.get_supplier_daily_order_report(
   '62000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Chicago')::date-1);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-supplier report read permitted';end if;
 blocked:=false;
 begin
  perform public.get_supplier_usps_readiness(
   '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-supplier USPS status exposed';end if;
end $other$;
rollback;

begin;
set local role anon;
do $anon$
declare blocked boolean:=false;
begin
 begin
  perform public.get_supplier_usps_readiness(
   '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous USPS readiness exposed';end if;
end $anon$;
rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Daily reporting unexpectedly enabled commerce';end if;
end $post$;
select 'PASS: daily report snapshots, supplier RLS, no label purchases or orders';
