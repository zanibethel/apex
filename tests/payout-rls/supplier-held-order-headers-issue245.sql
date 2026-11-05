-- Issue #245: isolated header-read-only supplier tenancy / data minimization.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test'
  or to_regprocedure(
    'public.get_supplier_held_order_headers(uuid,integer,integer)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Header read tests require disposable isolated DB';end if;
end $guard$;
begin;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values
('65000245-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'SYNTH-HEADER-ONE','confirmed',7500,'USD','2026-11-03 19:00:00+00'),
('65000245-0000-4000-8000-000000000002',
 '62000000-0000-0000-0000-000000000001',
 'SYNTH-HEADER-TWO','pending',1250,'USD','2026-11-04 19:00:00+00');
insert into apex_internal.order_detail_snapshots(
 id,store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256)
values
('66000245-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '65000245-0000-4000-8000-000000000001',
 'SYNTH-HEADER-ONE','2026-11-03 19:00:00+00','confirmed',7500,repeat('e',64)),
('66000245-0000-4000-8000-000000000002',
 '62000000-0000-0000-0000-000000000001',
 '65000245-0000-4000-8000-000000000002',
 'SYNTH-HEADER-TWO','2026-11-04 19:00:00+00','pending',1250,repeat('f',64));
insert into apex_internal.order_line_snapshots(
 id,order_id,store_id,source_line_reference,line_number,product_id,
 sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256)
values
('67000245-0000-4000-8000-000000000001',
 '66000245-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'line-1',1,'64000000-0000-0000-0000-000000000001',
 'SYNTH-SKU-HIDDEN','SYNTH-NONMEDICAL-HIDDEN',1,7500,repeat('c',64));
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $authorized$
declare v jsonb; denied boolean:=false;
begin
 v:=public.get_supplier_held_order_headers(
 '62000000-0000-0000-0000-000000000001',1,0);
 if v->>'schema_version'<>'1' or v->>'total'<>'2'
  or v->>'has_more'<>'true' or jsonb_array_length(v->'orders')<>1
  or v->'orders'->0->>'original_reference'<>'SYNTH-HEADER-TWO'
  or v->'orders'->0->>'recorded_sale_state'<>'pending'
  or v->>'source_attested'<>'false' or v->>'payment_enabled'<>'false'
  or v->>'shipping_enabled'<>'false'
 then raise exception 'Supplier metadata page or release flags wrong';end if;
 v:=public.get_supplier_held_order_headers(
 '62000000-0000-0000-0000-000000000001',1,1);
 if v->>'has_more'<>'false'
  or v->'orders'->0->>'original_reference'<>'SYNTH-HEADER-ONE'
  or v->'orders'->0->>'stored_line_count'<>'1'
  or v->'orders'->0->>'can_ship'<>'false'
  or v::text like '%SYNTH-SKU-HIDDEN%'
  or v::text like '%SYNTH-NONMEDICAL-HIDDEN%'
  or v::text like '%ciphertext%'
  or v::text like '%unit_price%'
  or v::text like '%shipping_address%'
 then raise exception 'Supplier header projection leaked line or private data';end if;
 begin perform 1 from apex_internal.order_detail_snapshots limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier gained direct order access';end if;
 denied:=false;
 begin perform public.get_supplier_held_order_headers(
  '62000000-0000-0000-0000-000000000001',26,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Oversized page accepted';end if;
 denied:=false;
 begin perform public.get_supplier_held_order_headers(
  '62000000-0000-0000-0000-000000000002',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-supplier store metadata leaked';end if;
end $authorized$;
rollback;
begin;
set local role anon;
do $anonymous$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_headers(
  '62000000-0000-0000-0000-000000000001',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous role could read headers';end if;
end $anonymous$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous_account$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_held_order_headers(
  '62000000-0000-0000-0000-000000000001',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous account could read headers';end if;
end $anonymous_account$;
rollback;
do $final$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots
  where id='66000245-0000-4000-8000-000000000001')
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Header read test left durable source';end if;
end $final$;
select 'PASS: bounded original header metadata, supplier isolation, no PII, no commerce grant';
