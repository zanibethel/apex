-- Issue #215 Phase 3: supplier-owned tracking DRAFT RPC acceptance.
-- All changes in BEGIN/ROLLBACK; no live shipment, labels or buyer data.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regprocedure('public.submit_supplier_review_tracking_draft(uuid,uuid,uuid,integer,text,text)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Review tracking RPC tests require disposable gated DB';end if;
end $preflight$;
begin;
do $setup$
declare
 changed integer;
 plan uuid;
begin
 -- Promote the synthetic reader to manager INSIDE this rollback fixture.
 -- Do not rely on the unrelated seed's default supplier membership role.
 update public.supplier_memberships m set role='manager'
 from public.stores s
 where s.supplier_id=m.supplier_id
 and s.id='62000000-0000-0000-0000-000000000001'
 and m.user_id='00000000-0000-0000-0000-000000000002';
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Expected one synthetic manager membership';end if;
 select p.id into plan from apex_internal.review_shipment_plans p
 where p.store_id='62000000-0000-0000-0000-000000000001'
  and p.client_shipment_reference='SYNTH-215-RACE-REPLAY';
 if plan is null then raise exception 'Expected synthetic shipment plan';end if;
 perform set_config('apex.test.review_plan_id',plan::text,true);
end $setup$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $member$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 plan uuid:=current_setting('apex.test.review_plan_id')::uuid;
 v jsonb; denied boolean;
 expected uuid:='70000215-0000-4000-8000-000000000980';
 second uuid:='70000215-0000-4000-8000-000000000981';
begin
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,expected,1,'USPS','94000000000000000980');
 if v->>'status'<>'draft_saved'
 or v->>'expected_revision'<>'1'
 or v->>'observed_revision'<>'2'
 or v->>'shipped'<>'false'
 or v->>'carrier_verified'<>'false'
 or v->>'label_purchased'<>'false'
 or v->>'latest_carrier'<>'USPS'
 or v->>'latest_tracking_reference'<>'94000000000000000980'
 then raise exception 'Draft owner submission did not save safe metadata';end if;

 -- Same request/id and exactly the same content: replay is safe.
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,expected,1,'USPS','94000000000000000980');
 if v->>'status'<>'identical_replay'
 or v->>'observed_revision'<>'2'
 then raise exception 'Exact tracking replay was not idempotent';end if;

 -- Same content but NEW request ID with old version: show a refresh hint.
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,second,1,'USPS','94000000000000000981');
 if v->>'status'<>'stale_version'
 or v->>'expected_revision'<>'1'
 or v->>'observed_revision'<>'2'
 or v->>'latest_tracking_reference'<>'94000000000000000980'
 then raise exception 'Stale version silently overwrote latest proposal';end if;

 -- Same event ID with changed contents returns a clear conflict.
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,expected,1,'USPS','94000000000000000982');
 if v->>'status'<>'duplicate_conflict'
 or v->>'observed_revision'<>'2'
 or v->>'latest_tracking_reference'<>'94000000000000000980'
 then raise exception 'Conflicting request ID was accepted';end if;

 -- New key + fresh revision but duplicate carrier/tracking across attempts.
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,second,2,'USPS','94000000000000000980');
 if v->>'status'<>'duplicate_conflict'
 or v->>'observed_revision'<>'2'
 then raise exception 'Duplicate draft tracking reference accepted';end if;
 if (select revision from apex_internal.review_shipment_plans
     where id=plan)<>2
 or (select count(*) from apex_internal.review_shipment_events
     where shipment_id=plan)<>2
 then raise exception 'Conflict attempted a revision without durable event';end if;

 -- Legitimate review-only next draft increments monotonic revision.
 v:=public.submit_supplier_review_tracking_draft(
 s,plan,second,2,'UPS','1Z999AA10123456784');
 if v->>'status'<>'draft_saved'
 or v->>'observed_revision'<>'3'
 or v->>'latest_carrier'<>'UPS'
 then raise exception 'Next revisioned tracking draft not recorded';end if;

 denied:=false;
 begin
  perform public.submit_supplier_review_tracking_draft(
   '62000000-0000-0000-0000-000000000002',
   plan,gen_random_uuid(),3,'UPS','1Z999AA10123456784');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Wrong supplier updated another plan';end if;
 denied:=false;
 begin
  perform public.submit_supplier_review_tracking_draft(
   s,gen_random_uuid(),gen_random_uuid(),1,'USPS','94000000000000000999');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unbound plan was writable';end if;
 denied:=false;
 begin
  perform public.submit_supplier_review_tracking_draft(
   s,plan,gen_random_uuid(),3,'USPS','<private>');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unsafe tracking string accepted';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(
   s,plan,gen_random_uuid(),3,'USPS','94000000000000000999');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier bypassed audited RPC';end if;
end $member$;
reset role;

-- The same supplier membership in the staff role is read-only, not a writer.
update public.supplier_memberships m set role='staff'
from public.stores s
where s.supplier_id=m.supplier_id
 and s.id='62000000-0000-0000-0000-000000000001'
 and m.user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $staff$
declare
 denied boolean:=false;
 plan uuid:=current_setting('apex.test.review_plan_id')::uuid;
begin
 begin perform public.submit_supplier_review_tracking_draft(
  '62000000-0000-0000-0000-000000000001',plan,
   gen_random_uuid(),3,'USPS','94000000000000000998');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Staff edited draft reserved for owner/manager';end if;
end $staff$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $nonmember$
declare denied boolean:=false;
begin
 begin perform public.submit_supplier_review_tracking_draft(
 '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
 gen_random_uuid(),1,'USPS','94000000000000000998');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign supplier wrote tracking draft';end if;
end $nonmember$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous_member$
declare denied boolean:=false;
begin
 begin perform public.submit_supplier_review_tracking_draft(
 '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
 gen_random_uuid(),1,'USPS','94000000000000000998');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous member wrote tracking';end if;
end $anonymous_member$;
rollback;
begin;
set local role anon;
do $public$
declare denied boolean:=false;
begin
 begin perform public.submit_supplier_review_tracking_draft(
 '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
 gen_random_uuid(),1,'USPS','94000000000000000998');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Public role accessed draft writer';end if;
end $public$;
rollback;
do $final$
begin
 if exists(select 1 from apex_internal.review_shipment_events
 where event_key in (
  '70000215-0000-4000-8000-000000000980',
  '70000215-0000-4000-8000-000000000981'))
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Tracking fixture mutated durable data or opened commerce';end if;
end $final$;
select 'PASS: owner/manager draft entry, exact replay, stale diff, conflict rollback and staff/cross-store denial';
