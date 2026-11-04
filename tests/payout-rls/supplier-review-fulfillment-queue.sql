-- Issue #215 phase 2: read-only, supplier-scoped, synthetically planned queue.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regprocedure('public.get_supplier_review_fulfillment_queue(uuid,integer,integer)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Supplier fulfillment queue test is disposable-only';end if;
end $preflight$;
begin;
-- The Phase 4 restricted worker created one genuinely held synthetic order.
-- The Phase 1 two-session race left one plan allocating both units of line 1.
-- This additional incomplete header proves missing original line/delivery
-- records are never invented by the supplier-facing queue.
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000915-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'SYNTH-INCOMPLETE-QUEUE-215','pending',5000,'USD',
 '2026-11-04T17:30:00Z');
insert into apex_internal.order_detail_snapshots(
 store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256)
values('62000000-0000-0000-0000-000000000001',
 '65000915-0000-4000-8000-000000000001',
 'SYNTH-INCOMPLETE-QUEUE-215','2026-11-04T17:30:00Z',
 'pending',5000,repeat('e',64));
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $baseline$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 v jsonb; held jsonb; incomplete jsonb; lines jsonb; plans jsonb;
begin
 v:=public.get_supplier_review_fulfillment_queue(s,10,0);
 if v->>'store_id'<>s::text or v->>'source'<>'synthetic_held_review'
 or v->>'schema_version'<>'1' or (v->>'total')::int<3
 or v->>'shipping_enabled'<>'false'
 or v->>'label_purchase_enabled'<>'false'
 or v->>'tracking_entry_enabled'<>'false'
 or v->>'delivery_decryption_enabled'<>'false'
 then raise exception 'Unscoped or commerce-authorized queue';end if;
 select t.item into held from jsonb_array_elements(v->'orders') as t(item)
 where t.item->>'order_reference'='APEX-HELD-WORKER-SYNTH-A';
 select t.item into incomplete from jsonb_array_elements(v->'orders') as t(item)
 where t.item->>'order_reference'='SYNTH-INCOMPLETE-QUEUE-215';
 if held is null or incomplete is null
 then raise exception 'Synthetic queue missing canonical order references';end if;
 if incomplete->>'readiness'<>'incomplete_held_record'
 or incomplete->'purchased_units'<>'null'::jsonb
 or incomplete->'planned_units'<>'null'::jsonb
 or jsonb_array_length(incomplete->'lines')<>0
 or jsonb_array_length(incomplete->'plans')<>0
 or incomplete->>'can_ship'<>'false'
 then raise exception 'Incomplete order leaked partial quantities or shipping';end if;
 lines:=held->'lines'; plans:=held->'plans';
 if held->>'readiness'<>'held_review_only'
 or held->>'purchased_units'<>'3'
 or held->>'planned_units'<>'2'
 or held->>'unplanned_units'<>'1'
 or held->>'can_ship'<>'false'
 or held->>'can_enter_tracking'<>'false'
 or jsonb_array_length(lines)<>2
 or jsonb_array_length(plans)<>1
 or lines->0->>'purchased_quantity'<>'2'
 or lines->0->>'planned_quantity'<>'2'
 or lines->0->>'unplanned_quantity'<>'0'
 or lines->1->>'purchased_quantity'<>'1'
 or lines->1->>'unplanned_quantity'<>'1'
 or plans->0->>'status'<>'review_only'
 or plans->0->>'planned_units'<>'2'
 or jsonb_array_length(plans->0->'tracking_drafts')<>0
 then raise exception 'Baseline planned/unplanned quantities not faithfully projected';end if;
 if lower(v::text) like '%nonce%'
 or lower(v::text) like '%ciphertext%'
 or lower(v::text) like '%key_reference%'
 or lower(v::text) like '%source_sha256%'
 or lower(v::text) like '%address%'
 or lower(v::text) like '%recipient%'
 or lower(v::text) like '%phone%'
 or lower(v::text) like '%email%'
 or lower(v::text) like '%product_id%'
 then raise exception 'Queue leaks private delivery or raw source data';end if;
end $baseline$;
reset role;

-- Independently reviewed disposable admin can add a second PLAN and draft,
-- but this does NOT simulate physical shipment or carrier acceptance.
do $record_draft$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 o uuid; l uuid; receipt jsonb; shipment_id uuid;
begin
 select h.id into o from apex_internal.order_detail_snapshots h
 where h.store_id=s and h.sale_id='65000614-0000-4000-8000-000000000001';
 select l0.id into l from apex_internal.order_line_snapshots l0
 where l0.store_id=s and l0.order_id=o and l0.line_number=2;
 if o is null or l is null then raise exception 'Canonical synthetic lines missing';end if;
 receipt:=apex_internal.create_review_shipment_plan(s,o,
  'SYNTH-QUEUE-215-SECOND',
  jsonb_build_array(jsonb_build_object('order_line_id',l,'quantity',1)),
  '70000215-0000-4000-8000-000000000950');
 if receipt->>'status'<>'plan_recorded' or receipt->>'revision'<>'1'
 then raise exception 'Additional synthetic plan failed';end if;
 shipment_id:=(receipt->>'shipment_id')::uuid;
 receipt:=apex_internal.record_review_tracking_draft(s,shipment_id,
  '70000215-0000-4000-8000-000000000951',1,
  'USPS','94000000000000000951');
 if receipt->>'status'<>'tracking_draft_recorded'
 or receipt->>'shipped'<>'false'
 then raise exception 'Draft tracking mistakenly marked shipped';end if;
end $record_draft$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $review$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 v jsonb; held jsonb; line2 jsonb; second jsonb;
 denied boolean;
begin
 v:=public.get_supplier_review_fulfillment_queue(s,10,0);
 select t.item into held from jsonb_array_elements(v->'orders') as t(item)
 where t.item->>'order_reference'='APEX-HELD-WORKER-SYNTH-A';
 if held->>'purchased_units'<>'3'
 or held->>'planned_units'<>'3'
 or held->>'unplanned_units'<>'0'
 or jsonb_array_length(held->'plans')<>2
 or held->>'can_ship'<>'false'
 then raise exception 'Fully planned became shipped or count was wrong';end if;
 line2:=held->'lines'->1;
 if line2->>'planned_quantity'<>'1' or line2->>'unplanned_quantity'<>'0'
 then raise exception 'Per-line split accounting changed';end if;
 select t.item into second from jsonb_array_elements(held->'plans') as t(item)
 where t.item->>'reference'='SYNTH-QUEUE-215-SECOND';
 if second is null or second->>'revision'<>'2'
 or second->>'status'<>'review_only'
 or second->>'planned_units'<>'1'
 or second->>'can_ship'<>'false'
 or second->>'can_buy_label'<>'false'
 or jsonb_array_length(second->'tracking_drafts')<>1
 or second->'tracking_drafts'->0->>'carrier'<>'USPS'
 or second->'tracking_drafts'->0->>'tracking_reference'<>'94000000000000000951'
 then raise exception 'Tracking proposal missing or appeared as real shipment';end if;
 v:=public.get_supplier_review_fulfillment_queue(s,1,0);
 if jsonb_array_length(v->'orders')<>1 or v->>'has_more'<>'true'
 or v->'orders'->0->>'order_reference'<>'SYNTH-INCOMPLETE-QUEUE-215'
 then raise exception 'First queue page was not stable';end if;
 v:=public.get_supplier_review_fulfillment_queue(s,1,1);
 if jsonb_array_length(v->'orders')<>1 or v->>'has_more'<>'true'
 or v->'orders'->0->>'order_reference'='SYNTH-INCOMPLETE-QUEUE-215'
 then raise exception 'Second page leaked duplicate record';end if;
 denied:=false;
 begin perform public.get_supplier_review_fulfillment_queue(s,21,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unbounded page size allowed';end if;
 denied:=false;
 begin perform public.get_supplier_review_fulfillment_queue(s,10,-1);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Negative queue offset allowed';end if;
 denied:=false;
 begin perform 1 from apex_internal.review_shipment_events limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Direct private tracking audit readable';end if;
end $review$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $foreign$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_fulfillment_queue(
  '62000000-0000-0000-0000-000000000001',10,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross supplier viewed shipment planning';end if;
end $foreign$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anon_user$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_fulfillment_queue(
  '62000000-0000-0000-0000-000000000001',10,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous user viewed shipment planning';end if;
end $anon_user$;
rollback;
begin;
set local role anon;
do $public$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_fulfillment_queue(
  '62000000-0000-0000-0000-000000000001',10,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Public caller viewed shipment planning';end if;
end $public$;
rollback;

do $postflight$
begin
 if exists(select 1 from apex_internal.review_shipment_plans
  where client_shipment_reference='SYNTH-QUEUE-215-SECOND')
 or exists(select 1 from apex_internal.order_detail_snapshots
  where sale_id='65000915-0000-4000-8000-000000000001')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Demo queue mutated real-like state or failed rollback';end if;
end $postflight$;
select 'PASS: member-only demo queue, original per-line unplanned counts, private tracking drafts, no shipments';
