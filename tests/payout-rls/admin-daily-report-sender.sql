\set ON_ERROR_STOP on
-- PR211: admin-only sender fingerprint activation never reveals the token.
do $base$
begin
 if has_function_privilege('anon','public.admin_activate_daily_report_mail_sender(text)','EXECUTE')
  or has_table_privilege('authenticated','apex_internal.supplier_report_mail_activation_audit','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_report_mail_worker_tokens','UPDATE')
 then raise exception 'Admin activation permissions incorrect';end if;
end $base$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"supplier"},"is_anonymous":false}',true);
do $supplier$
declare blocked boolean:=false;
begin
 begin perform public.admin_activate_daily_report_mail_sender(repeat('a',64));
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Supplier activated service credentials';end if;
 blocked:=false;
 begin perform public.get_admin_daily_mail_sender_readiness(repeat('a',64));
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Supplier viewed sender credential status';end if;
end $supplier$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"},"is_anonymous":false}',true);
do $admin$
declare v jsonb;blocked boolean:=false;
begin
 v:=public.get_admin_daily_mail_sender_readiness(repeat('b',64));
 if v->>'sender_activated'<>'false'
 then raise exception 'Unknown fingerprint appeared active';end if;
 begin perform public.admin_activate_daily_report_mail_sender('invalid');
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Invalid sender fingerprint accepted';end if;
 v:=public.admin_activate_daily_report_mail_sender(repeat('b',64));
 if v->>'sender_activated'<>'true' then
  raise exception 'Verified admin could not activate sender';end if;
 v:=public.get_admin_daily_mail_sender_readiness(repeat('b',64));
 if v->>'sender_activated'<>'true' or v->>'purchasing_enabled'<>'false'
 then raise exception 'Worker fingerprint verification failed';end if;
 v:=public.get_admin_daily_mail_sender_readiness(repeat('c',64));
 if v->>'sender_activated'<>'false' then
  raise exception 'Wrong runtime fingerprint marked active';end if;
end $admin$;
rollback;

do $release$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Sender activation changed public release';end if;
end $release$;
select 'PASS: admin fingerprint activation is audited, scoped and independent of checkout';
