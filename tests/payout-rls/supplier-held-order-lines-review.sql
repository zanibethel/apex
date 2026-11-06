-- Supplier original purchased-line read contract; disposable DB only.
\set ON_ERROR_STOP on
do $safety$
begin
 if current_database()<>'apex_test'
  or to_regprocedure('public.get_supplier_held_order_lines(uuid,uuid)') is null
  or (select enabled from apex_internal.private_release_gate where singleton=true)
     is distinct from false
  or has_function_privilege('anon',
   'public.get_supplier_held_order_lines(uuid,uuid)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.order_line_snapshots','SELECT')
 then raise exception 'Order-line test must run only in disposable DB';end if;
end $safety$;

begin;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at
) values(
 '65000300-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'SYNTH-LINES-300','confirmed',12500,'USD','2026-11-06 20:00:00+00'
);

insert into apex_internal.order_detail_snapshots(
 id,store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256
) values(
 '66000300-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '65000300-0000-4000-8000-000000000001',
 'SYNTH-LINES-300','2026-11-06 20:00:00+00',
 'confirmed',12500,repeat('d',64)
);
insert into apex_internal.order_line_snapshots(
 id,order_id,store_id,source_line_reference,line_number,product_id,
 sku_at_purchase,title_at_purchase,variant_at_purchase,quantity,
 unit_price_cents,source_line_sha256
) values(
 '67000300-0000-4000-8000-000000000001',
 '66000300-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'synthetic-line-one',1,
 '64000000-0000-0000-0000-000000000001',
 'SYNTH-SKU-ONE','Synthetic ordinary product','medium',2,5000,
 repeat('e',64)
),(
 '67000300-0000-4000-8000-000000000002',
 '66000300-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'synthetic-line-two',2,
 '64000000-0000-0000-0000-000000000001',
 'SYNTH-SKU-TWO','Synthetic second product','',1,2500,
 repeat('f',64)
);
insert into apex_internal.order_delivery_envelopes(
 order_id,store_id,key_reference,nonce,ciphertext,auth_tag
) values(
 '66000300-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'ci_fake_secret',
 decode(repeat('01',12),'hex'),
 decode(repeat('ab',32),'hex'),
 decode(repeat('cf',16),'hex')
);

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $member$
declare v jsonb; v_lines jsonb;
begin
 v:=public.get_supplier_held_order_lines(
  '62000000-0000-0000-0000-000000000001',
  '66000300-0000-4000-8000-000000000001');
 if v is null or v->>'schema_version'<>'1'
  or v->>'source'<>'original_held_order_line_snapshots'
  or v->>'store_id'<>'62000000-0000-0000-0000-000000000001'
  or v->>'order_id'<>'66000300-0000-4000-8000-000000000001'
  or v->>'line_count'<>'2'
  or v->>'held_only'<>'true'
  or v->>'product_eligibility_verified'<>'false'
  or v->>'payment_verified'<>'false'
  or v->>'shipping_enabled'<>'false'
  or v->>'delivery_decryption_enabled'<>'false'
  or (select count(*) from jsonb_object_keys(v))<>11
 then raise exception 'Original held line response invalid';end if;
 v_lines:=v->'lines';
 if jsonb_array_length(v_lines)<>2
  or v_lines->0->>'line_id'<>'67000300-0000-4000-8000-000000000001'
  or v_lines->1->>'line_number'<>'2'
  or v_lines->0->>'quantity'<>'2'
  or v_lines->0->>'unit_price_cents'<>'5000'
  or v_lines->0->>'line_subtotal_cents'<>'10000'
  or v_lines->0->>'variant_at_purchase'<>'medium'
  or v_lines->1->>'line_subtotal_cents'<>'2500'
  or v_lines->0->>'status'<>'held_unverified'
  or v_lines->0->>'shipping_authorized'<>'false'
 then raise exception 'Original line projection or quantities invalid';end if;
 if v::text like '%ci_fake_secret%'
  or v::text like '%ciphertext%'
  or v::text like '%source_line_sha256%'
  or v::text like '%payment_authorized%'
  or v::text like '%shipping_address%'
  or v::text like '%buyer_email%'
  or v::text like '%source_event_sha256%'
 then raise exception 'Private payment/destination data leaked';end if;
 if public.get_supplier_held_order_lines(
  '62000000-0000-0000-0000-000000000001',
  '66000300-0000-4000-8000-000000000002') is not null
 then raise exception 'Nonexistent order should return null';end if;
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
 begin perform public.get_supplier_held_order_lines(
  '62000000-0000-0000-0000-000000000002',
  '66000300-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-supplier line read permitted';end if;
end $cross_store$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous_account$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_lines(
  '62000000-0000-0000-0000-000000000001',
  '66000300-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous account read lines';end if;
end $anonymous_account$;
rollback;

begin;
set local role anon;
do $anon_role$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_lines(
  '62000000-0000-0000-0000-000000000001',
  '66000300-0000-4000-8000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous role read lines';end if;
end $anon_role$;
rollback;

do $cleanup$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots
    where id='66000300-0000-4000-8000-000000000001')
  or (select enabled from apex_internal.private_release_gate where singleton=true)
     is distinct from false
 then raise exception 'Line read test changed live state';end if;
end $cleanup$;
select 'PASS: immutable supplier-only purchase lines; no cross-store/anon, no PII, no shipping/purchase authority' as result;