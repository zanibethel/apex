-- Disposable RLS and behavior tests. The fixture is shared with the separate race test.
\set ON_ERROR_STOP on
begin;
do $permissions$
begin
 if current_database() <> 'apex_test'
  or (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'apex_internal' and c.relkind = 'r' and c.relname like 'held_shipment_plan%'
      and c.relrowsecurity and c.relforcerowsecurity
      and not has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
      and not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')) <> 4
  or has_schema_privilege('authenticated', 'apex_internal', 'USAGE')
 then raise exception 'Expected four private forced-RLS tables'; end if;
end $permissions$;

create function pg_temp.expect_plan_error(statement text, expected_code text, expected_message text default null)
 returns void language plpgsql as $fn$
begin
 begin
  execute statement;
 exception when others then
  if sqlstate = expected_code and (expected_message is null or sqlerrm = expected_message) then return; end if;
  raise;
 end;
 raise exception 'Expected % from %', expected_code, statement;
end $fn$;

set local role anon;
select pg_temp.expect_plan_error('select public.get_supplier_held_shipment_plans_v1(null, null, 0)', '42501');
select pg_temp.expect_plan_error('select public.save_supplier_held_shipment_plan_v1(null, null, null, null, null, null, null, null)', '42501');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"is_anonymous":false}';

do $behavior$
declare
 v_store uuid := '62000000-0000-0000-0000-000000000001';
 v_order uuid := 'a2150000-0000-4000-8000-000000000001';
 v_other_order uuid := 'a2150000-0000-4000-8000-000000000002';
 v_line uuid := 'a2152000-0000-4000-8000-000000000001';
 v_second_line uuid := 'a2152000-0000-4000-8000-000000000101';
 v_key uuid := gen_random_uuid();
 v_move_key uuid := gen_random_uuid();
 v_cancel_key uuid := gen_random_uuid();
 v_first jsonb := jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 2),
  jsonb_build_object('line_id', v_second_line, 'quantity', 1));
 v_second jsonb := jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 3));
 v_single jsonb := jsonb_build_array(jsonb_build_object('line_id', v_line, 'quantity', 1));
 v_ship uuid;
 v_other_ship uuid;
 v_view jsonb;
 v_reply jsonb;
 v_target text;
 v_sql constant text := 'select public.save_supplier_held_shipment_plan_v1(%L,%L,%L,%L,%L,%L,%L,%L)';
begin
 v_view := public.get_supplier_held_shipment_plans_v1(v_store, v_order, 0);
 if (v_view->'plans') is distinct from '[]'::jsonb or (v_view->>'review_revision') is distinct from '0' then
  raise exception 'Expected an empty starting ledger';
 end if;

 v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_key, null, null, null, v_first, null);
 v_ship := (v_reply->>'shipment_id')::uuid;
 if v_ship is null or v_reply->>'scope' <> 'held_review' or v_reply->>'replayed' <> 'false' then
  raise exception 'Invalid creation receipt';
 end if;
 v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_key, null, null, null,
  jsonb_build_array(v_first->1, v_first->0), null);
 if (v_reply->>'shipment_id')::uuid is distinct from v_ship or v_reply->>'replayed' <> 'true' then
  raise exception 'Normalized replay created a second plan';
 end if;
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, v_key, null, null, null, v_second, null),
  'PT409', 'shipment_plan_request_conflict');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_other_order, v_key, null, null, null, v_first, null),
  'PT409', 'shipment_plan_request_conflict');

 -- A manager may review the same store, but cannot replay another actor's request.
 perform set_config('request.jwt.claim.sub', 'a2153000-0000-4000-8000-000000000003', true);
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, v_key, null, null, null, v_first, null),
  'PT409', 'shipment_plan_request_conflict');
 v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), null, null, null, v_second, null);
 v_other_ship := (v_reply->>'shipment_id')::uuid;
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null,
  jsonb_build_array(v_single->0, v_first->1), null), 'PT409', 'shipment_plan_quantity_conflict');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_other_order, gen_random_uuid(), null, null, null, v_single, null),
  '22023', 'shipment_plan_line_not_in_order');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null,
  '[{"line_id":"a2152000-0000-4000-8000-000000000006","quantity":1}]', null), '22023', 'shipment_plan_line_not_in_order');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null,
  jsonb_build_array(v_single->0, v_single->0), null), '22023', 'invalid_shipment_plan_allocations');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null,
  jsonb_build_array((v_single->0) || '{"approved":true}'::jsonb), null), '22023', 'invalid_shipment_plan_allocations');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null,
  jsonb_build_array((v_single->0) || '{"quantity":1.5}'::jsonb), null), '22023', 'invalid_shipment_plan_allocations');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), null, null, null, '[]', null),
  '22023', 'invalid_shipment_plan_allocations');

 v_view := public.get_supplier_held_shipment_plans_v1(v_store, v_order, 0);
 if jsonb_array_length(v_view->'plans') <> 2 or v_view->>'review_revision' <> '2'
  or v_view->'lines'->0->>'planned_quantity' <> '5' or v_view->'lines'->1->>'planned_quantity' <> '1'
  or v_view->>'shipping_enabled' <> 'false' or v_view->>'order_id' <> v_order::text
  or v_view::text ~ 'ciphertext|tracking_number|source_event_sha256|customer_address'
 then raise exception 'Partial plans did not preserve the original order, quantities, or privacy'; end if;

 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), v_ship, 1, 'exception', null, 'review_issue'),
  '22023', 'invalid_shipment_plan_transition');
 perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_move_key, v_ship, 1, 'under_review', null, 'review_started');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), v_ship, 1, 'cancelled', null, 'quantity_correction'),
  'PT409', 'shipment_plan_revision_conflict');
 foreach v_target in array array['packing', 'label_ready', 'shipped', 'delivered'] loop
  perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), v_ship, 2, v_target, null, 'approved'),
   '42501', 'operational_shipment_disabled');
 end loop;
 perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), v_ship, 2, 'exception', null, 'review_issue');
 perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), v_ship, 3, 'under_review', null, 'review_reopened');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, v_cancel_key, v_ship, 4, 'cancelled', null, 'other reason'),
  '22023', 'invalid_shipment_plan_transition');
 perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_cancel_key, v_ship, 4, 'cancelled', null, 'quantity_correction');
 v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_cancel_key, v_ship, 4, 'cancelled', null, 'quantity_correction');
 if v_reply->>'replayed' <> 'true' or v_reply->>'revision' <> '5' then raise exception 'Cancel replay mismatch'; end if;
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, v_cancel_key, v_ship, 4, 'cancelled', null, 'plan_no_longer_needed'),
  'PT409', 'shipment_plan_request_conflict');
 v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, v_move_key, v_ship, 1, 'under_review', null, 'review_started');
 if v_reply->>'replayed' <> 'true' or v_reply->>'revision' <> '2' then raise exception 'Historical replay mismatch'; end if;
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, v_move_key, v_ship, 2, 'exception', null, 'review_issue'),
  'PT409', 'shipment_plan_request_conflict');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_order, gen_random_uuid(), v_ship, 5, 'under_review', null, 'review_reopened'),
  '22023', 'invalid_shipment_plan_transition');
 perform pg_temp.expect_plan_error(format(v_sql, v_store, v_other_order, gen_random_uuid(), v_ship, 5, 'under_review', null, 'review_reopened'),
  '42501', 'held_shipment_plan_access_denied');

 v_view := public.get_supplier_held_shipment_plans_v1(v_store, v_order, 0);
 if v_view->>'review_revision' <> '6' or v_view->'lines'->0->>'planned_quantity' <> '3'
  or v_view->'lines'->1->>'planned_quantity' <> '0'
  or not (v_view->'plans') @> jsonb_build_array(jsonb_build_object('shipment_id', v_ship, 'state', 'cancelled',
    'allocations', v_first, 'events', jsonb_build_array(jsonb_build_object('revision', 5,
     'actor_id', 'a2153000-0000-4000-8000-000000000003', 'from_state', 'under_review',
     'to_state', 'cancelled', 'reason', 'quantity_correction'))))
 then raise exception 'Cancellation did not restore capacity and preserve audit and allocations'; end if;

 -- Both review history and plan pages are bounded. Balances use all active plans.
 perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), v_other_ship, 1, 'under_review', null, 'review_started');
 for v_revision in 2..12 loop
  perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), v_other_ship, v_revision,
   case when v_revision % 2 = 0 then 'exception' else 'under_review' end, null,
   case when v_revision % 2 = 0 then 'review_issue' else 'review_reopened' end);
 end loop;
 for v_page_test in 1..10 loop
  v_reply := public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(), null, null, null,
   jsonb_build_array(v_first->1), null);
  perform public.save_supplier_held_shipment_plan_v1(v_store, v_order, gen_random_uuid(),
   (v_reply->>'shipment_id')::uuid, 1, 'cancelled', null, 'plan_no_longer_needed');
 end loop;
 v_view := public.get_supplier_held_shipment_plans_v1(v_store, v_order, 0);
 if jsonb_array_length(v_view->'plans') <> 10 or v_view->>'has_more' <> 'true'
  or v_view->'lines'->0->>'planned_quantity' <> '3' then raise exception 'First plan page or global balance incorrect'; end if;
 v_view := public.get_supplier_held_shipment_plans_v1(v_store, v_order, 1);
 if jsonb_array_length(v_view->'plans') <> 2 or v_view->>'has_more' <> 'false'
  or v_view->'plans'->0->>'shipment_id' <> v_other_ship::text
  or jsonb_array_length(v_view->'plans'->0->'events') <> 10
 then raise exception 'Older plan page or bounded history incorrect'; end if;

 -- Direct SQL cannot address the private routines or tables even with valid membership.
 perform pg_temp.expect_plan_error('select * from apex_internal.held_shipment_plan_events', '42501');
 perform pg_temp.expect_plan_error('select apex_internal.read_held_shipment_plans_v1(null,null,0)', '42501');
end $behavior$;

do $scope$
declare
 v_store uuid := '62000000-0000-0000-0000-000000000001';
 v_order uuid := 'a2150000-0000-4000-8000-000000000001';
 v_foreign_store uuid := 'a2154000-0000-4000-8000-000000000001';
 v_foreign_order uuid := 'a2150000-0000-4000-8000-000000000006';
 v_actor text;
 v_read constant text := 'select public.get_supplier_held_shipment_plans_v1(%L,%L,0)';
 v_write constant text := 'select public.save_supplier_held_shipment_plan_v1(%L,%L,gen_random_uuid(),null,null,null,null,null)';
begin
 perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
 perform pg_temp.expect_plan_error(format(v_read, v_foreign_store, v_foreign_order), '42501');
 perform pg_temp.expect_plan_error(format(v_write, v_foreign_store, v_foreign_order), '42501');
 perform pg_temp.expect_plan_error(format(v_read, 'a2154000-0000-4000-8000-000000000002', v_order), '42501');
 perform pg_temp.expect_plan_error(format(v_read, v_store, v_foreign_order), '42501');
 foreach v_actor in array array['a2153000-0000-4000-8000-000000000001', 'a2153000-0000-4000-8000-000000000002',
  'a2153000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000003', ''] loop
  perform set_config('request.jwt.claim.sub', v_actor, true);
  perform set_config('request.jwt.claims', '{"is_anonymous":false,"user_metadata":{"role":"owner"}}', true);
  perform pg_temp.expect_plan_error(format(v_read, v_store, v_order), '42501');
  perform pg_temp.expect_plan_error(format(v_write, v_store, v_order), '42501');
 end loop;
 perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
 perform set_config('request.jwt.claims', '{"is_anonymous":true}', true);
 perform pg_temp.expect_plan_error(format(v_read, v_store, v_order), '42501');
 perform pg_temp.expect_plan_error(format(v_write, v_store, v_order), '42501');
end $scope$;
reset role;

do $integrity$
begin
 perform pg_temp.expect_plan_error('update apex_internal.held_shipment_plan_events set actor_id = gen_random_uuid()', '55000');
 perform pg_temp.expect_plan_error('delete from apex_internal.held_shipment_plan_allocations', '55000');
 perform pg_temp.expect_plan_error('update apex_internal.held_shipment_plans set state = ''shipped''', '23514');
 if (select count(*) from apex_internal.held_shipment_plan_events where from_state is null) <> 12
  or exists (select 1 from apex_internal.order_detail_snapshots where source_order_reference like 'SYNTH-PLAN-%'
    and (record_status <> 'held_unverified' or fulfillment_authorized or payment_authorized
      or original_purchased_at <> '2026-11-06 18:00:00+00'))
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Immutable held-order or append-only event invariants failed'; end if;
end $integrity$;
rollback;
