-- Issue #217: synthetic-only email report manifests and provider status,
-- all changes rolled back; never send mail or activate delivery.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regprocedure(
  'apex_internal.prepare_review_email_manifest(uuid,date,uuid,uuid,text,integer,integer,integer)') is null
 or to_regprocedure('public.get_supplier_review_email_status(uuid,date)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Review email test requires disposable gated DB';end if;
end $preflight$;
begin;
do $manifest$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 u uuid:='00000000-0000-0000-0000-000000000002';
 today date:=current_date;
 earlier date:=current_date-1;
 d text:=repeat('a',64);
 r jsonb;
 m uuid; retry_m uuid;
 forbidden boolean;
begin
 -- Requires already-authorized verified opt-in and supplier membership
 -- from original daily supplier email fixture.
 r:=apex_internal.prepare_review_email_manifest(s,today,u,
  '72000217-0000-4000-8000-000000000001',d,640,2,4);
 if r->>'outcome'<>'prepared' or r->>'state'<>'prepared'
  or r->>'mail_sent'<>'false' or r->>'inbox_delivered'<>'false'
  or r->>'transport_mode'<>'synthetic_only'
  or r->>'attempt_count'<>'1' or r->>'revision'<>'1'
 then raise exception 'Review manifest not safely prepared';end if;
 m:=(r->>'manifest_id')::uuid;
 perform set_config('apex.test.review_email_manifest',m::text,true);
 r:=apex_internal.prepare_review_email_manifest(s,today,u,
  '72000217-0000-4000-8000-000000000001',d,640,2,4);
 if r->>'outcome'<>'identical_replay' then
  raise exception 'Same email report identity was not replayed';end if;
 r:=apex_internal.prepare_review_email_manifest(s,today,u,
  '72000217-0000-4000-8000-000000000002',d,640,2,4);
 if r->>'outcome'<>'already_prepared' or r->>'attempt_count'<>'1'
 then raise exception 'Same date generated duplicate mail';end if;
 forbidden:=false;
 begin perform apex_internal.prepare_review_email_manifest(s,today,u,
  '72000217-0000-4000-8000-000000000003',repeat('b',64),640,2,4);
 exception when unique_violation then forbidden:=true;end;
 if not forbidden then raise exception 'Changed report hash reused frozen day';end if;

 forbidden:=false;
 begin perform apex_internal.prepare_review_email_manifest(s,today,
  '00000000-0000-0000-0000-000000000003',
  '72000217-0000-4000-8000-000000000004',d,640,2,4);
 exception when insufficient_privilege then forbidden:=true;end;
 if not forbidden then raise exception 'Unverified or non-opted recipient accepted';end if;
 forbidden:=false;
 begin perform apex_internal.prepare_review_email_manifest(
  '62000000-0000-0000-0000-000000000002',today,u,
  '72000217-0000-4000-8000-000000000005',d,640,2,4);
 exception when insufficient_privilege then forbidden:=true;end;
 if not forbidden then raise exception 'Foreign store re-used subscriber';end if;

 -- Before provider acceptance, "delivered" must be impossible.
 forbidden:=false;
 begin perform apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000006',1,
  'simulated_delivered','synthetic_provider_001',null);
 exception when check_violation then forbidden:=true;end;
 if not forbidden then raise exception 'Delivered without acceptance';end if;

 r:=apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000007',1,
  'simulated_accepted','synthetic_provider_001',null);
 if r->>'state'<>'simulated_accepted' or r->>'revision'<>'2'
  or r->>'mail_sent'<>'false'
 then raise exception 'Synthetic provider acceptance state failed';end if;
 r:=apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000007',1,
  'simulated_accepted','synthetic_provider_001',null);
 if r->>'outcome'<>'identical_replay' then
  raise exception 'Provider acknowledgement replay was not idempotent';end if;
 forbidden:=false;
 begin perform apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000007',1,
  'simulated_accepted','synthetic_provider_002',null);
 exception when unique_violation then forbidden:=true;end;
 if not forbidden then raise exception 'Changed provider event replay was accepted';end if;
 forbidden:=false;
 begin perform apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000008',1,
  'simulated_delivered','synthetic_provider_001',null);
 exception when serialization_failure then forbidden:=true;end;
 if not forbidden then raise exception 'Stale event bypassed revision check';end if;
 r:=apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000009',2,
  'simulated_delivered','synthetic_provider_001',null);
 if r->>'state'<>'simulated_delivered' or r->>'revision'<>'3'
 then raise exception 'Delivery needs independent provider event';end if;
 forbidden:=false;
 begin perform apex_internal.record_review_email_simulated_event(
  m,'72000217-0000-4000-8000-000000000010',3,
  'simulated_failed','synthetic_provider_001','synthetic_bounce');
 exception when check_violation then forbidden:=true;end;
 if not forbidden then raise exception 'Terminal delivery could be reversed';end if;

 -- A second day exercises failed preview and bounded retry. Neither
 -- creates an actual email or changes the frozen digest.
 r:=apex_internal.prepare_review_email_manifest(s,earlier,u,
  '72000217-0000-4000-8000-000000000011',d,640,2,4);
 retry_m:=(r->>'manifest_id')::uuid;
 r:=apex_internal.record_review_email_simulated_event(retry_m,
  '72000217-0000-4000-8000-000000000012',1,
  'simulated_failed',null,'synthetic_timeout');
 if r->>'state'<>'simulated_failed' or r->>'revision'<>'2'
 then raise exception 'Synthetic failure not visible';end if;
 r:=apex_internal.prepare_review_email_manifest(s,earlier,u,
  '72000217-0000-4000-8000-000000000013',d,640,2,4);
 if r->>'outcome'<>'retry_prepared' or r->>'state'<>'prepared'
  or r->>'attempt_count'<>'2' or r->>'revision'<>'3'
 then raise exception 'Failed send could not re-enter review preparation';end if;
 if (select count(*) from apex_internal.supplier_review_email_manifests
  where store_id=s and recipient_user_id=u)<>2
 or (select count(*) from apex_internal.supplier_review_email_events
  where store_id=s)<>6
 then raise exception 'Duplicate or missing synthetic audit records';end if;
end $manifest$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $authorized$
declare
 r jsonb;
 forbidden boolean:=false;
begin
 r:=public.get_supplier_review_email_status(
  '62000000-0000-0000-0000-000000000001',current_date);
 if r->>'state'<>'simulated_delivered'
 or r->>'attempt_count'<>'1'
 or r->>'transport_mode'<>'synthetic_only'
 or r->>'real_provider_accepted'<>'false'
 or r->>'real_inbox_delivered'<>'false'
 or r->>'mail_sent'<>'false'
 or r::text like '%supplier.fixture@example.test%'
 then raise exception 'Synthetic status falsely claims real delivery';end if;
 begin perform 1 from apex_internal.supplier_review_email_manifests limit 1;
 exception when insufficient_privilege then forbidden:=true;end;
 if not forbidden then raise exception 'Recipient read private outbox table';end if;
end $authorized$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $foreign$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_email_status(
  '62000000-0000-0000-0000-000000000001',current_date);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-supplier email status disclosed';end if;
end $foreign$;
rollback;

begin;
set local role anon;
do $anonymous$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_email_status(
  '62000000-0000-0000-0000-000000000001',current_date);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous email status disclosed';end if;
end $anonymous$;
rollback;

do $final$
begin
 if exists(select 1 from apex_internal.supplier_review_email_manifests)
 or exists(select 1 from apex_internal.supplier_review_email_events)
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Review email fixture left durable mail or commerce state';end if;
end $final$;
select 'PASS: opted-in synthetic manifest, per-day dedupe, simulated provider events, private status and rollback';
