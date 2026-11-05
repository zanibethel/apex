-- Track 3 #219: isolated, rollback-only owner delivery alert sender tests.
\set ON_ERROR_STOP on
do $pre$
begin
 if current_database()<>'apex_test' then
  raise exception 'Owner alert fixture restricted to apex_test';end if;
 if has_table_privilege('anon',
  'apex_internal.owner_mail_health_alert_outbox','SELECT')
 or has_table_privilege('authenticated',
  'apex_internal.owner_mail_health_alert_outbox','UPDATE')
 or has_function_privilege('authenticated',
  'public.claim_owner_mail_health_alert(text)','EXECUTE')
 or not has_function_privilege('anon',
  'public.claim_owner_mail_health_alert(text)','EXECUTE')
 then raise exception 'Owner alert ACL preflight failed';end if;
end $pre$;

begin;
set local role anon;
do $noop$
declare v jsonb;blocked boolean:=false;
begin
 begin perform public.claim_owner_mail_health_alert(repeat('b',64));
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Forged worker claimed owner alert';end if;
 v:=public.claim_owner_mail_health_alert(repeat('a',64));
 if v->>'state'<>'no_alerts' then
  raise exception 'No-bounce report emitted owner alert';end if;
end $noop$;
rollback;

-- Change latest synthetic event to bounced, and verify one frozen claimed
-- report, token restrictions, 15-minute lease, exact-day acceptance, replay.
begin;
insert into apex_internal.supplier_report_delivery_events(
 event_id,dispatch_id,provider_email_id,event_type,occurred_at)
values(
 'evt_owneralert999',
 '66000219-0000-4000-8000-000000000001',
 'mail_accepted123456','email.bounced',now()+interval '1 minute');

set local role anon;
do $alert$
declare v jsonb;second jsonb;blocked boolean:=false;d date;
begin
 v:=public.claim_owner_mail_health_alert(repeat('a',64));
 if v->>'state'<>'claimed'
  or (v->'summary'->>'bounced')::int<1
  or (v->'summary'->>'alert_count')::int<1
  or v ? 'to' or v ? 'email' or v ? 'store_id'
 then raise exception 'Owner alert claim is missing or leaks data';end if;
 d:=(v->>'report_date')::date;
 second:=public.claim_owner_mail_health_alert(repeat('a',64));
 if second->>'state'<>'not_claimed'
 then raise exception 'Duplicate owner alert claimed within lease';end if;
 begin
  perform public.accept_owner_mail_health_alert(
   repeat('b',64),d,'mail_owner_health123456');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Wrong worker accepted owner alert';end if;
 blocked:=false;
 begin
  perform public.accept_owner_mail_health_alert(
   repeat('a',64),d-1,'mail_owner_health123456');
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Wrong report day accepted';end if;
 if not public.accept_owner_mail_health_alert(
  repeat('a',64),d,'mail_owner_health123456')
 then raise exception 'Valid provider acknowledgement failed';end if;
 if public.accept_owner_mail_health_alert(
  repeat('a',64),d,'mail_owner_health123456')
 then raise exception 'Duplicate provider acknowledgement succeeded';end if;
 second:=public.claim_owner_mail_health_alert(repeat('a',64));
 if second->>'state'<>'not_claimed'
 then raise exception 'Already-accepted owner alert reclaimed';end if;
end $alert$;
rollback;

do $held$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 or exists(select 1 from apex_internal.owner_mail_health_alert_outbox)
 then raise exception 'Owner mail alert modified commerce or persisted test mail';end if;
end $held$;
select 'PASS: owner alert token, no-alert silence, frozen leases, acceptance and no commerce';
