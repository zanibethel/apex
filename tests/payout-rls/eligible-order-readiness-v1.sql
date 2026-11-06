-- Track 2/3 read boundary, synthetic disposable fixtures from the #302 ledger.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database() <> 'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or not exists (
   select 1 from apex_internal.order_detail_snapshots
   where store_id = '62000000-0000-0000-0000-000000000001'
  )
  or has_function_privilege('anon',
   'public.get_supplier_eligible_order_readiness_v1(uuid)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots','SELECT')
 then raise exception 'Eligible readiness fixture preflight denied'; end if;
end $preflight$;

begin;
set local role anon;
do $anon$
declare v_denied boolean := false;
begin
 begin
  perform public.get_supplier_eligible_order_readiness_v1(
   '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then v_denied := true; end;
 if not v_denied then raise exception 'Anonymous caller saw order eligibility'; end if;
end $anon$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims" = '{"is_anonymous":false}';
do $member$
declare
 v jsonb;
 v_denied boolean := false;
begin
 v := public.get_supplier_eligible_order_readiness_v1(
  '62000000-0000-0000-0000-000000000001');
 if v->>'schema_version' <> '1'
  or v->>'source' <> 'held_order_readiness_no_independent_attestation'
  or (v->>'held_order_count')::int < 6
  or v->'eligible_orders' is distinct from '[]'::jsonb
  or v->>'eligible_order_count' <> '0'
  or v->>'blocker' <> 'independent_eligibility_evidence_not_integrated'
  or v->>'read_only' <> 'true'
  or v->>'eligible_queue_enabled' <> 'false'
  or v->>'payment_verified' <> 'false'
  or v->>'product_and_transport_verified' <> 'false'
  or v->>'shipping_enabled' <> 'false'
  or v->>'delivery_access_enabled' <> 'false'
  or v->>'can_purchase_label' <> 'false'
  or v->>'can_record_tracking' <> 'false'
  or (select count(*) from jsonb_object_keys(v)) <> 15
 then raise exception 'Held orders were treated as independently eligible'; end if;

 if v::text ~* 'recipient|address|ciphertext|secret|source_event_sha256|tracking_number|a2150000'
 then raise exception 'Private data or historical order leaked to eligibility read'; end if;
 begin
  perform public.get_supplier_eligible_order_readiness_v1(
   'a2154000-0000-4000-8000-000000000001');
 exception when insufficient_privilege then v_denied := true; end;
 if not v_denied then raise exception 'Cross supplier eligibility read permitted'; end if;

 v_denied := false;
 perform set_config('request.jwt.claims', '{"is_anonymous":true}', true);
 begin
  perform public.get_supplier_eligible_order_readiness_v1(
   '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then v_denied := true; end;
 if not v_denied then raise exception 'Anonymous JWT passed membership check'; end if;
end $member$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub" = 'a2153000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"is_anonymous":false}';
do $other$
declare v jsonb;
begin
 v := public.get_supplier_eligible_order_readiness_v1(
  'a2154000-0000-4000-8000-000000000001');
 if v->>'held_order_count' <> '1'
  or v->>'eligible_order_count' <> '0'
 then raise exception 'Other supplier scope/count leaked or eligible gate opened'; end if;
end $other$;
rollback;

select 'PASS: eligible read contract denies unverified, cross-supplier and anonymous requests; no PII or shipment capabilities' as result;
