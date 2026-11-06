-- Synthetic held order identity read. Must run in disposable apex_test only.
\set ON_ERROR_STOP on
do $safety$
begin
 if current_database()<>'apex_test'
  or to_regprocedure('public.get_supplier_held_order_record(uuid,uuid)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
  or has_function_privilege('anon',
   'public.get_supplier_held_order_record(uuid,uuid)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots','SELECT')
 then raise exception 'Single-order review test fixture not safe';end if;
end $safety$;

begin;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values(
 '65000299-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'TEST-REVIEW-SINGLE','confirmed',7500,'USD','2026-11-06 18:30:00+00'
);
insert into apex_internal.order_detail_snapshots(
 id,store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256
) values(
 '66000299-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '65000299-0000-4000-8000-000000000001',
 'TEST-REVIEW-SINGLE','2026-11-06 18:30:00+00',
 'confirmed',7500,repeat('a',64)
);
insert into apex_internal.order_line_snapshots(
 id,order_id,store_id,source_line_reference,line_number,product_id,
 sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256
) values(
 '67000299-0000-4000-8000-000000000001',
 '66000299-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'private-line-1',1,
 '64000000-0000-0000-0000-000000000001',
 'SYNTH-PRIVATE-SKU-DO-NOT-LEAK','SYNTH-PRIVATE-TITLE-DO-NOT-LEAK',
 1,7500,repeat('b',64)
);
insert into apex_internal.order_delivery_envelopes(
 order_id,store_id,key_reference,nonce,ciphertext,auth_tag
) values(
 '66000299-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'ci_test_key',decode(repeat('01',12),'hex'),
 decode(repeat('ca',32),'hex'),decode(repeat('ab',16),'hex')
);

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $member$
declare v jsonb;
begin
 v:=public.get_supplier_held_order_record(
  '62000000-0000-0000-0000-000000000001',
  '66000299-0000-4000-8000-000000000001');
 if v is null or
  v->>'schema_version'<>'1' or
  v->>'source'<>'original_held_order_record' or
  v->>'order_id'<>'66000299-0000-4000-8000-000000000001' or
  v->>'store_id'<>'62000000-0000-0000-0000-000000000001' or
  v->>'original_reference'<>'TEST-REVIEW-SINGLE' or
  v->>'purchased_at_utc'<>'2026-11-06T18:30:00.000Z' or
  v->>'recorded_sale_state'<>'confirmed' or
  v->>'stored_line_count'<>'1' or
  v->>'destination_sealed'<>'true' or
  v->>'source_history_matched'<>'true' or
  v->>'held_only'<>'true' or
  v->>'payment_enabled'<>'false' or
  v->>'shipping_enabled'<>'false' or
  v->>'delivery_decryption_enabled'<>'false' or
  jsonb_object_length(v)<>14
 then raise exception 'Original order record projection incorrect';end if;
 if v::text like '%SYNTH-PRIVATE-SKU%'
  or v::text like '%SYNTH-PRIVATE-TITLE%'
  or v::text like '%key_reference%'
  or v::text like '%shipping_address%'
  or v::text like '%ciphertext%'
  or v::text like '%unit_price%'
  or v::text like '%7500%'
 then raise exception 'Single order review leaked private line or recipient data';end if;

 if public.get_supplier_held_order_record(
  '62000000-0000-0000-0000-000000000001',
  '66000299-0000-4000-8000-000000000002') is not null
 then raise exception 'Absent order ID should return null';end if;
end $member$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $cross_store$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_record(
 '62000000-0000-0000-0000-000000000002',
 '66000299-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store order record available';end if;
end $cross_store$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous_member$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_record(
 '62000000-0000-0000-0000-000000000001',
 '66000299-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous account gained order record';end if;
end $anonymous_member$;
rollback;

begin;
set local role anon;
do $anonymous_role$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_record(
 '62000000-0000-0000-0000-000000000001',
 '66000299-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anon role gained order record';end if;
end $anonymous_role$;
rollback;

do $cleanup$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots
    where id='66000299-0000-4000-8000-000000000001')
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Test left a real order or changed public gate';end if;
end $cleanup$;
select 'PASS: member-only immutable held order by ID; no other-store, line, customer, payment or shipping access' as result;