-- PR212: verified sales identity, atomic stale import detection,
-- replay idempotency and cross-tenant denial (disposable PostgreSQL only).
\set ON_ERROR_STOP on
do $pre$
begin
 if has_table_privilege('authenticated','apex_internal.supplier_sales_review','SELECT')
  or has_table_privilege('anon','apex_internal.supplier_sales_review_audit','SELECT')
  or has_function_privilege('anon',
   'public.apply_supplier_sales_reconciliation(uuid,uuid,jsonb)','EXECUTE')
 then raise exception 'Reconciliation role grants are not private';end if;
end $pre$;

begin;
insert into public.supplier_sales_history(
 store_id,order_reference,sale_state,gross_cents,currency,confirmed_btc_sats,occurred_at)
values('62000000-0000-0000-0000-000000000001',
 'APX-VERIFIED-212','confirmed',12500,'USD',35000,
 '2026-11-03 18:30:00+00');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $owner$
declare v jsonb;v_row jsonb;v_payload jsonb;v_result jsonb;
 v_id uuid:='f2120000-0000-4000-8000-000000000001';
 blocked boolean:=false;
begin
 v:=public.get_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',200);
 if v->>'total'<>'1' or v->>'truncated'<>'false'
  or v->'rows'->0->>'order_reference'<>'APX-VERIFIED-212'
  or v->'rows'->0->>'purchased_at_utc'<>'2026-11-03T18:30:00.000000Z'
 then raise exception 'Original verified purchase timestamp missing';end if;
 v_row:=v->'rows'->0||jsonb_build_object(
  'store_id','62000000-0000-0000-0000-000000000001',
  'review_state','reviewed','review_note','Checked verified sale');
 v_payload:=jsonb_build_array(v_row);
 v_result:=public.apply_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',v_id,v_payload);
 if v_result->>'updated'<>'1' or v_result->>'unchanged'<>'0'
  or v_result->>'duplicates_created'<>'0'
 then raise exception 'First review import incorrect';end if;
 v_result:=public.apply_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',v_id,v_payload);
 if v_result->>'unchanged'<>'1' or v_result->>'updated'<>'0'
 then raise exception 'Repeated workbook should be idempotent';end if;
 v:=public.get_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',200);
 if v->'rows'->0->>'review_state'<>'reviewed'
  or v->'rows'->0->>'version'<>'1'
 then raise exception 'Saved annotation not returned';end if;
 blocked:=false;
 begin
  perform public.apply_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
   jsonb_build_array(v_row||jsonb_build_object(
    'review_state','needs_attention')));
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Stale workbook overwrote newer changes';end if;
 blocked:=false;
 begin
  perform public.apply_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
   jsonb_build_array(v_row||jsonb_build_object(
    'purchased_at_utc','2026-11-04T18:30:00.000000Z')));
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Modified purchase date accepted';end if;
 blocked:=false;
 begin
  perform public.apply_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
   jsonb_build_array(v_row||jsonb_build_object('gross_cents','99999')));
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Modified gross amount accepted';end if;
 blocked:=false;
 begin
  perform public.apply_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
   jsonb_build_array(v_row||jsonb_build_object(
    'store_id','00000000-0000-0000-0000-000000000003')));
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Cross-store workbook row accepted';end if;
 blocked:=false;
 begin
  perform public.apply_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
   jsonb_build_array(v_row,v_row));
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Duplicate source row accepted';end if;
 v_result:=public.apply_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
  jsonb_build_array((v->'rows'->0||jsonb_build_object(
   'store_id','62000000-0000-0000-0000-000000000001',
   'review_state','needs_attention','review_note','Review latest record'))));
 if v_result->>'updated'<>'1' then raise exception 'Fresh version rejected';end if;
end $owner$;

reset role;
do $audit$
begin
 if (select count(*) from apex_internal.supplier_sales_review_audit
  where store_id='62000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Review audit must log changes exactly once';end if;
 if (select count(*) from public.supplier_sales_history
  where order_reference='APX-VERIFIED-212')<>1
 then raise exception 'Reconciliation duplicated an order';end if;
end $audit$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $cross$
declare blocked boolean:=false;
begin
 begin perform public.get_supplier_sales_reconciliation(
   '62000000-0000-0000-0000-000000000001',10);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Another supplier read private sales';end if;
 blocked:=false;
 begin perform public.apply_supplier_sales_reconciliation(
  '62000000-0000-0000-0000-000000000001',gen_random_uuid(),
  '[{"store_id":"62000000-0000-0000-0000-000000000001"}]'::jsonb);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Another supplier wrote private review';end if;
end $cross$;
rollback;

do $release$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Sales review changed the purchase/release gate';end if;
end $release$;
select 'PASS: verified sales review replay, stale denial, tenant scope and no order creation';