-- Issue #215: isolated, synthetic-only review shipment allocation + tracking.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or to_regprocedure('apex_internal.create_review_shipment_plan(uuid,uuid,text,jsonb,uuid)') is null
 then raise exception 'Shipment ledger test must be disposable and gated';end if;
end $preflight$;
begin;
do $checks$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 s_foreign uuid:='62000000-0000-0000-0000-000000000002';
 sale uuid:='65000614-0000-4000-8000-000000000001';
 o uuid;
 line1 uuid;
 line2 uuid;
 first_plan uuid;
 second_plan uuid;
 first_idem uuid:='70000215-0000-4000-8000-000000000001';
 second_idem uuid:='70000215-0000-4000-8000-000000000002';
 tracking_idem uuid:='70000215-0000-4000-8000-000000000101';
 revised_idem uuid:='70000215-0000-4000-8000-000000000102';
 plan_a jsonb;
 plan_b jsonb;
 v jsonb;
 denied boolean;
begin
 select id into o from apex_internal.order_detail_snapshots
 where store_id=s and sale_id=sale;
 if o is null then raise exception 'Missing phase-4 held order fixture';end if;
 select id into line1 from apex_internal.order_line_snapshots
 where store_id=s and order_id=o and line_number=1;
 select id into line2 from apex_internal.order_line_snapshots
 where store_id=s and order_id=o and line_number=2;
 if line1 is null or line2 is null then
  raise exception 'Missing original immutable line fixtures';end if;
 plan_a:=jsonb_build_array(jsonb_build_object(
  'order_line_id',line1,'quantity',1));
 select jsonb_agg(jsonb_build_object(
  'order_line_id',x.line_id,'quantity',1) order by x.line_id::text)
 into plan_b from (values (line1),(line2)) x(line_id);

 -- First plan takes 1 of 2 purchased units, not a shipment.
 v:=apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-01',plan_a,first_idem);
 if v->>'status'<>'plan_recorded'
 or v->>'shipping_authorized'<>'false'
 or v->>'shipment_created'<>'false'
 or v->>'revision'<>'1'
 then raise exception 'First plan granted real shipment or failed to record';end if;
 first_plan:=(v->>'shipment_id')::uuid;

 -- Identical event ID: same plan, same immutable allocation, no duplicates.
 v:=apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-01',plan_a,first_idem);
 if v->>'status'<>'identical_plan_replay'
 or (v->>'shipment_id')::uuid<>first_plan
 then raise exception 'Plan repeat was not idempotent';end if;
 denied:=false;
 begin
  perform apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-01',jsonb_build_array(
     jsonb_build_object('order_line_id',line1,'quantity',2)),first_idem);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Allocation rewrite accepted on replay';end if;
 denied:=false;
 begin
  perform apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-01',plan_a,
   '70000215-0000-4000-8000-000000000003');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Same reference accepted under different event';end if;

 -- Second plan legitimately splits across first + second original line.
 v:=apex_internal.create_review_shipment_plan(s,o,
  'SYNTH-PLAN-215-02',plan_b,second_idem);
 if v->>'status'<>'plan_recorded' then
  raise exception 'Partial shipment split not available';end if;
 second_plan:=(v->>'shipment_id')::uuid;
 if (select sum(planned_quantity) from apex_internal.review_shipment_allocations
  where order_line_id=line1 and store_id=s and order_id=o)<>2
 or (select sum(planned_quantity) from apex_internal.review_shipment_allocations
  where order_line_id=line2 and store_id=s and order_id=o)<>1
 then raise exception 'Original line allocation totals incorrect';end if;
 denied:=false;
 begin
  perform apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-03',plan_a,
   '70000215-0000-4000-8000-000000000004');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Oversubscribed immutable purchased units';end if;

 denied:=false;
 begin
  perform apex_internal.create_review_shipment_plan(s_foreign,o,
   'SYNTH-FOREIGN-215',plan_a,
   '70000215-0000-4000-8000-000000000005');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-supplier order planned';end if;
 denied:=false;
 begin
  perform apex_internal.create_review_shipment_plan(s,o,
   'SYNTH-PLAN-215-DUPLICATE-LINE',
   jsonb_build_array(
    jsonb_build_object('order_line_id',line1,'quantity',1),
    jsonb_build_object('order_line_id',line1,'quantity',1)),
   '70000215-0000-4000-8000-000000000006');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate order line in allocation accepted';end if;

 -- Tracking "entry" is only an immutable review proposal, not proof of
 -- postage purchase, physical shipment, carrier acceptance or delivery.
 v:=apex_internal.record_review_tracking_draft(s,first_plan,
  tracking_idem,1,'USPS','94000000000000000001');
 if v->>'status'<>'tracking_draft_recorded' or v->>'revision'<>'2'
 or v->>'shipped'<>'false' or v->>'label_purchased'<>'false'
 or v->>'carrier_verified'<>'false'
 then raise exception 'Draft tracking mutated shipping permissions';end if;
 v:=apex_internal.record_review_tracking_draft(s,first_plan,
  tracking_idem,1,'USPS','94000000000000000001');
 if v->>'status'<>'identical_tracking_draft_replay'
 or v->>'revision'<>'2'
 then raise exception 'Tracking replay created a second event';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s,first_plan,
   tracking_idem,1,'USPS','94000000000000000002');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Conflicting tracking event accepted';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s,first_plan,
   '70000215-0000-4000-8000-000000000103',1,
   'USPS','94000000000000000003');
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale shipment revision overwritten';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s,second_plan,
   '70000215-0000-4000-8000-000000000104',1,
   'USPS','94000000000000000001');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Tracking ID duplicated across shipments';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s_foreign,first_plan,
   '70000215-0000-4000-8000-000000000105',2,
   'USPS','94000000000000000005');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign store modified tracking';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s,first_plan,
   '70000215-0000-4000-8000-000000000106',2,
   'UNKNOWN','TRACK12345678');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Unknown carrier accepted';end if;
 denied:=false;
 begin
  perform apex_internal.record_review_tracking_draft(s,first_plan,
   '70000215-0000-4000-8000-000000000107',2,
   'USPS','<script>');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Malformed tracking text accepted';end if;
 v:=apex_internal.record_review_tracking_draft(s,first_plan,
   revised_idem,2,'USPS','94000000000000000004');
 if v->>'status'<>'tracking_draft_recorded' or v->>'revision'<>'3'
 then raise exception 'Versioned tracking proposal failed';end if;

 if (select revision from apex_internal.review_shipment_plans
  where id=first_plan)<>3
 or (select count(*) from apex_internal.review_shipment_events
  where shipment_id=first_plan)<>3
 or (select count(*) from apex_internal.review_shipment_events
  where shipment_id=second_plan)<>1
 or (select count(*) from apex_internal.review_shipment_plans where order_id=o)<>2
 then raise exception 'Versioned shipment audit/plan count incorrect';end if;
 denied:=false;
 begin
  update apex_internal.review_shipment_events
  set carrier='UPS' where shipment_id=first_plan;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Tracking audit was mutable';end if;
 denied:=false;
 begin
  update apex_internal.review_shipment_allocations
  set planned_quantity=99 where shipment_id=first_plan;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Original allocation changed';end if;
 denied:=false;
 begin
  update apex_internal.review_shipment_plans
  set plan_status='shipped' where id=first_plan;
 exception when check_violation or sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Review-only plan became a real shipment';end if;
 if exists(select 1 from apex_internal.review_shipment_plans
    where plan_status<>'review_only' or fulfillment_authorized=true
      or label_purchase_authorized=true)
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Review shipment ledger activated commerce';end if;
end $checks$;

-- Existing and future authenticated staff MUST NOT call these review writers.
set local role authenticated;
do $permissions$
declare denied boolean:=false;
begin
 begin
  perform apex_internal.create_review_shipment_plan(
    '62000000-0000-0000-0000-000000000001',
    '66000214-0000-4000-8000-000000000001',
    'BAD',jsonb_build_array(),gen_random_uuid());
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Authenticated user can write shipment plan';end if;
 denied:=false;
 begin perform 1 from apex_internal.review_shipment_events limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Authenticated user can read raw shipment audit';end if;
end $permissions$;
rollback;
do $final$
begin
 if exists(select 1 from apex_internal.review_shipment_plans)
  or exists(select 1 from apex_internal.review_shipment_allocations)
  or exists(select 1 from apex_internal.review_shipment_events)
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Shipment review fixture did not roll back';end if;
end $final$;
select 'PASS: immutable partial allocations, idempotent tracking drafts, optimistic revisions, tenant denial and no shipping';
