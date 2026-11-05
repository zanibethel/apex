-- Disposable-only #219 aggregate mail health authorization and alert evidence.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test' then
  raise exception 'Mail health fixture requires apex_test';end if;
 if has_function_privilege('anon',
  'public.get_admin_supplier_mail_delivery_health(integer)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.supplier_report_delivery_events','SELECT')
 then raise exception 'Unsafe mail health privileges';end if;
end $guard$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"supplier"},"is_anonymous":false}',true);
do $supplier$
declare blocked boolean:=false;
begin
 begin perform public.get_admin_supplier_mail_delivery_health(7);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Supplier viewed owner mail health';end if;
end $supplier$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"},"is_anonymous":true}',true);
do $anonymous$
declare blocked boolean:=false;
begin
 begin perform public.get_admin_supplier_mail_delivery_health(7);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous JWT viewed admin mail health';end if;
end $anonymous$;
rollback;

begin;
insert into apex_internal.supplier_daily_report_email_outbox(
 id,store_id,report_date,user_id,state,provider_email_id
)values(
 '66000219-0000-4000-8000-000000000002',
 '62000000-0000-0000-0000-000000000001',
 (now() at time zone 'America/Chicago')::date-2,
 '00000000-0000-0000-0000-000000000002',
 'accepted','mail_bounced123456'
);
insert into apex_internal.supplier_report_delivery_events(
 event_id,dispatch_id,provider_email_id,event_type,occurred_at
) values(
 'evt_mail00004','66000219-0000-4000-8000-000000000002',
 'mail_bounced123456','email.bounced',now()
);
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"},"is_anonymous":false}',true);
do $owner$
declare v jsonb; blocked boolean:=false;
begin
 v:=public.get_admin_supplier_mail_delivery_health(7);
 if v->>'scope'<>'all_supplier_daily_reports'
  or (v->>'delivered_to_mail_server')::integer<1
  or (v->>'bounced')::integer<1
  or (v->>'alert_count')::integer<1
  or v->>'inbox_delivery_confirmed'<>'false'
  or v->>'can_ship'<>'false'
 then raise exception 'Owner mail monitoring calculation incorrect';end if;
 if v ? 'email' or v ? 'store_id' or v ? 'customer' or v ? 'provider_email_id'
 then raise exception 'Owner mail health disclosed private recipient metadata';end if;
 begin perform public.get_admin_supplier_mail_delivery_health(0);
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Invalid window was allowed';end if;
 blocked:=false;
 begin perform public.get_admin_supplier_mail_delivery_health(31);
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Unbounded window was allowed';end if;
end $owner$;
rollback;

do $held$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false then raise exception 'Mail alert enabled commerce';end if;
end $held$;
select 'PASS: aggregate admin mail alerts, JWT restrictions, no PII, held commerce';
