-- Issue #216 Phase 2: durable but disposable review-only annotation audit.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regprocedure('public.apply_supplier_cumulative_review_annotations(uuid,uuid,jsonb)') is null
 or to_regprocedure('public.get_supplier_cumulative_review_annotations(uuid)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Review annotation acceptance requires gated apex_test';end if;
end $preflight$;

begin;
do $fixture$
declare n integer; v_order uuid; v_plan uuid;
begin
 update public.supplier_memberships m set role='manager'
 from public.stores s where s.supplier_id=m.supplier_id
 and s.id='62000000-0000-0000-0000-000000000001'
 and m.user_id='00000000-0000-0000-0000-000000000002';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Expected one synthetic manager';end if;
 select id into v_order from apex_internal.order_detail_snapshots
 where store_id='62000000-0000-0000-0000-000000000001'
 and sale_id='65000614-0000-4000-8000-000000000001';
 select id into v_plan from apex_internal.review_shipment_plans
 where store_id='62000000-0000-0000-0000-000000000001'
 and client_shipment_reference='SYNTH-215-RACE-REPLAY';
 if v_order is null or v_plan is null then
  raise exception 'Missing original order or synthetic review plan';end if;
 perform set_config('apex.test.review_order',v_order::text,true);
 perform set_config('apex.test.review_plan',v_plan::text,true);
end $fixture$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $authorized$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 o uuid:=current_setting('apex.test.review_order')::uuid;
 p uuid:=current_setting('apex.test.review_plan')::uuid;
 id1 uuid:='72000216-0000-4000-8000-000000000001';
 id2 uuid:='72000216-0000-4000-8000-000000000002';
 id3 uuid:='72000216-0000-4000-8000-000000000003';
 id4 uuid:='72000216-0000-4000-8000-000000000004';
 v jsonb; change1 jsonb; change2 jsonb; change3 jsonb; plan_bad jsonb;
 denied boolean;
begin
 v:=public.get_supplier_cumulative_review_annotations(s);
 if v->>'schema_version'<>'1' or v->>'store_id'<>s::text
 or v->>'source'<>'held_review_annotations'
 or jsonb_array_length(v->'records')<>0
 or v->>'shipping_enabled'<>'false'
 then raise exception 'Initial read scope not private and empty';end if;
 change1:=jsonb_build_object(
  'order_id',o,'row_kind','order_line','line_number',1,
  'shipment_id',null,'source_revision',0,'review_version',0,
  'review_state','reviewed','review_note','Checked review-only');
 v:=public.apply_supplier_cumulative_review_annotations(
  s,id1,jsonb_build_array(change1));
 if v->>'status'<>'applied' or v->>'processed'<>'1'
  or v->>'updated'<>'1' or v->>'unchanged'<>'0'
  or v->>'order_created'<>'false'
  or v->>'shipment_modified'<>'false'
  or v->>'payment_modified'<>'false'
  or v->>'shipping_modified'<>'false'
 then raise exception 'Review annotation writer touched business state';end if;
 v:=public.get_supplier_cumulative_review_annotations(s);
 if jsonb_array_length(v->'records')<>1
 or v->'records'->0->>'review_state'<>'reviewed'
 or v->'records'->0->>'review_version'<>'1'
 or v->'records'->0->>'review_note'<>'Checked review-only'
 then raise exception 'Persisted review note not readable via scoped RPC';end if;

 -- Same exact request ID/payload replays one receipt, not another event.
 v:=public.apply_supplier_cumulative_review_annotations(
  s,id1,jsonb_build_array(change1));
 if v->>'status'<>'identical_import_replay'
 or v->>'updated'<>'1'
 then raise exception 'Exact request replay not idempotent';end if;
 -- Different request ID but same target contents creates no duplicate audit.
 v:=public.apply_supplier_cumulative_review_annotations(
  s,id2,jsonb_build_array(change1));
 if v->>'status'<>'applied' or v->>'updated'<>'0'
 or v->>'already_recorded'<>'1'
 then raise exception 'Repeated day upload was not idempotent';end if;

 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   s,id1,jsonb_build_array(change1||jsonb_build_object(
    'review_note','Changed under same request ID')));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Conflicting request ID accepted';end if;
 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   s,id3,jsonb_build_array(change1||jsonb_build_object(
    'review_note','Stale new value')));
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale review version overwrote newer note';end if;
 change2:=change1||jsonb_build_object('review_version',1,
  'review_state','needs_attention','review_note','Second authorized review');
 v:=public.apply_supplier_cumulative_review_annotations(
  s,id3,jsonb_build_array(change2));
 if v->>'updated'<>'1' or v->>'processed'<>'1'
 then raise exception 'Fresh review version edit did not apply';end if;

 -- Batch with one valid row followed by an unknown/stale plan must roll
 -- back the first row update, audit and receipt (all-or-nothing).
 change3:=change2||jsonb_build_object(
  'review_version',2,'review_note','Must roll back');
 plan_bad:=jsonb_build_object(
  'order_id',o,'row_kind','shipment_plan','line_number',null,
  'shipment_id',p,'source_revision',999,
  'review_version',0,'review_state','reviewed',
  'review_note','Old plan revision');
 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   s,id4,jsonb_build_array(change3,plan_bad));
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Mixed stale batch did not roll back';end if;
 v:=public.get_supplier_cumulative_review_annotations(s);
 if jsonb_array_length(v->'records')<>1
 or v->'records'->0->>'review_version'<>'2'
 or v->'records'->0->>'review_note'<>'Second authorized review'
 then raise exception 'A stale multi-row batch partially committed';end if;
 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   s,id4,jsonb_build_array(change2,change2));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate row key accepted in batch';end if;
 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   s,id4,jsonb_build_array(change1||
    jsonb_build_object('review_note','email@example.com')));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'PII-like review note passed';end if;
 denied:=false;
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   '62000000-0000-0000-0000-000000000002',id4,
   jsonb_build_array(change1));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store review import allowed';end if;
 denied:=false;
 begin perform 1 from apex_internal.supplier_review_annotations limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Private annotation table readable directly';end if;
end $authorized$;
reset role;
do $admin_audit$
declare s uuid:='62000000-0000-0000-0000-000000000001';
begin
 if (select count(*) from apex_internal.supplier_review_annotations
     where store_id=s)<>1
 or (select count(*) from apex_internal.supplier_review_annotation_audit
     where store_id=s)<>2
 or (select count(*) from apex_internal.supplier_review_upload_receipts
     where store_id=s)<>3
 or exists(select 1 from apex_internal.supplier_review_upload_receipts
     where request_id='72000216-0000-4000-8000-000000000004')
 then raise exception 'Audit or upload receipts contain a duplicate/partial batch';end if;
end $admin_audit$;

update public.supplier_memberships m set role='staff'
from public.stores s where s.supplier_id=m.supplier_id
and s.id='62000000-0000-0000-0000-000000000001'
and m.user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $staff$
declare denied boolean:=false;
begin
 begin
  perform public.apply_supplier_cumulative_review_annotations(
   '62000000-0000-0000-0000-000000000001',
   gen_random_uuid(),'[]'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Staff wrote review annotations';end if;
end $staff$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $outsider$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_cumulative_review_annotations(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store annotation read granted';end if;
 denied:=false;
 begin perform public.apply_supplier_cumulative_review_annotations(
  '62000000-0000-0000-0000-000000000001',
   gen_random_uuid(),'[]'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store annotation writer granted';end if;
end $outsider$;
rollback;
begin;
set local role anon;
do $anon$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_cumulative_review_annotations(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Public annotation read';end if;
end $anon$;
rollback;

do $postflight$
begin
 if exists(select 1 from apex_internal.supplier_review_annotations)
 or exists(select 1 from apex_internal.supplier_review_annotation_audit)
 or exists(select 1 from apex_internal.supplier_review_upload_receipts)
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Review fixture leaked durable/commerce state';end if;
end $postflight$;
select 'PASS: supplier-only atomic notes, durable audit, Day 4 replay, stale conflict and no shipment';
