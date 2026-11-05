-- Track 3 / #219: disposable provider event journal role isolation and replay.
\set ON_ERROR_STOP on
do $guards$
begin
 if current_database()<>'apex_test' then
  raise exception 'Synthetic mail fixture must not run in hosted production';
 end if;
 if has_table_privilege('anon',
   'apex_internal.supplier_report_delivery_events','SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.supplier_report_delivery_events','INSERT')
  or has_function_privilege('anon',
   'public.get_supplier_daily_report_delivery_status(uuid,date)','EXECUTE')
 then raise exception 'Provider event ledger isolation failed'; end if;
end $guards$;

begin;
insert into apex_internal.supplier_daily_report_email_outbox(
 id,store_id,report_date,user_id,state,provider_email_id
)values(
 '66000219-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 (now() at time zone 'America/Chicago')::date-1,
 '00000000-0000-0000-0000-000000000002',
 'accepted','mail_accepted123456'
);
insert into apex_internal.supplier_report_mail_worker_tokens(name,token_sha256)
values('daily_report_sender',
 encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'))
on conflict(name) do update set token_sha256=excluded.token_sha256;

set local role anon;
do $deny$
declare blocked boolean:=false;
begin
 begin
  perform public.record_supplier_daily_report_delivery_event(
   repeat('b',64),'evt_mail00001','mail_accepted123456',
   'email.delivered',now());
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Incorrect worker token accepted';end if;
 blocked:=false;
 begin
  perform public.record_supplier_daily_report_delivery_event(
   repeat('a',64),'evt_mail00002','mail_other123456',
   'email.delivered',now());
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Unrelated Resend message accepted';end if;
end $deny$;
set local role postgres;

set local role anon;
do $replay$
declare first jsonb;second jsonb;blocked boolean:=false;
begin
 first:=public.record_supplier_daily_report_delivery_event(
  repeat('a',64),'evt_mail00003','mail_accepted123456',
  'email.delivered',now());
 if first->>'recorded'<>'true' then
  raise exception 'Initial provider event not recorded';end if;
 second:=public.record_supplier_daily_report_delivery_event(
  repeat('a',64),'evt_mail00003','mail_accepted123456',
  'email.delivered',now());
 -- now() is fixed for the duration of this test transaction.
 if second->>'duplicate'<>'true' then
  raise exception 'Exact provider replay duplicated';end if;
 begin
  perform public.record_supplier_daily_report_delivery_event(
   repeat('a',64),'evt_mail00003','mail_accepted123456',
   'email.bounced',now());
 exception when unique_violation then blocked:=true;end;
 if not blocked then
  raise exception 'Changed receipt reused same provider event identity';end if;
end $replay$;
set local role postgres;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
do $owner$
declare result jsonb;
begin
 result:=public.get_supplier_daily_report_delivery_status(
  '62000000-0000-0000-0000-000000000001',
  (now() at time zone 'America/Chicago')::date-1);
 if result->>'state'<>'provider_delivered'
  or result->>'provider_accepted'<>'true'
  or result->>'inbox_delivery_confirmed'<>'false'
  or result->>'can_ship'<>'false'
 then raise exception 'Provider evidence overstated or unavailable';end if;
 if result ? 'email' or result ? 'address' or result ? 'provider_email_id'
 then raise exception 'Supplier mail status revealed recipient data';end if;
end $owner$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
do $foreign$
declare blocked boolean:=false;
begin
 begin
  perform public.get_supplier_daily_report_delivery_status(
   '62000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Chicago')::date-1);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then
  raise exception 'Foreign supplier read a private mail status';end if;
end $foreign$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous$
declare blocked boolean:=false;
begin
 begin
  perform public.get_supplier_daily_report_delivery_status(
   '62000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Chicago')::date-1);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Anonymous JWT viewed supplier email';end if;
end $anonymous$;
rollback;

do $still_held$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false then raise exception 'Mail event enabled commerce';end if;
end $still_held$;
rollback;
select 'PASS: event replay, supplier-only status, no PII or commerce release';
