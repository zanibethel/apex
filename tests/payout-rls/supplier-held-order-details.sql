-- Issue #214 Phase 8: supplier detail projection, synthetic-only tests.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or to_regprocedure('public.get_supplier_held_order_details(uuid,integer,integer)') is null
 then raise exception 'Supplier-held-details fixture requires disposable DB';end if;
end $preflight$;

begin;
-- Add an intentionally incomplete NEWER sale. This must never be passed
-- through as complete line-item data, nor become a shipment.
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000814-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'APEX-HELD-INCOMPLETE-214','pending',9999,'USD',
 '2026-11-04T15:30:00+00');
insert into apex_internal.order_detail_snapshots(
 store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256
) values('62000000-0000-0000-0000-000000000001',
 '65000814-0000-4000-8000-000000000001',
 'APEX-HELD-INCOMPLETE-214','2026-11-04T15:30:00+00',
 'pending',9999,repeat('e',64));

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $member$
declare
 v jsonb;
 a jsonb;
 b jsonb;
 keys text;
 denied boolean;
begin
 v:=public.get_supplier_held_order_details(
  '62000000-0000-0000-0000-000000000001',25,0);
 if v->>'schema_version'<>'1'
  or v->>'source'<>'private_held_order_snapshots'
  or v->>'store_id'<>'62000000-0000-0000-0000-000000000001'
  or v->>'total'<>'2'
  or v->>'has_more'<>'false'
  or jsonb_array_length(v->'orders')<>2
  or v->>'shipping_enabled'<>'false'
  or v->>'payment_enabled'<>'false'
  or v->>'delivery_decryption_enabled'<>'false'
 then raise exception 'Supplier detail list failed or granted commerce';end if;
 a:=v->'orders'->0;
 b:=v->'orders'->1;
 if a->>'order_reference'<>'APEX-HELD-INCOMPLETE-214'
 or a->>'display_status'<>'incomplete_held_record'
 or a->>'destination_sealed'<>'false'
 or jsonb_array_length(a->'lines')<>0
 or a->'subtotal_cents'<>'null'::jsonb
 or a->'gross_cents'<>'null'::jsonb
 or a->>'can_ship'<>'false'
 or a->>'can_pay'<>'false'
 then raise exception 'Incomplete order exposed partial or payable data';end if;

 if b->>'order_reference'<>'APEX-HELD-WORKER-SYNTH-A'
 or b->>'display_status'<>'held_unverified'
 or b->>'recorded_sale_state'<>'confirmed'
 or b->>'destination_sealed'<>'true'
 or b->>'subtotal_cents'<>'10000'
 or b->>'shipping_cents'<>'1500'
 or b->>'discount_cents'<>'1000'
 or b->>'gross_cents'<>'10500'
 or b->>'can_ship'<>'false'
 or b->>'can_pay'<>'false'
 or b->>'can_decrypt'<>'false'
 or jsonb_array_length(b->'lines')<>2
 or b->'lines'->0->>'quantity'<>'2'
 or b->'lines'->0->>'unit_price_cents'<>'4000'
 or b->'lines'->1->>'line_number'<>'2'
 then raise exception 'Supplier immutable lines/totals not accurate';end if;
 -- The safe projection never exposes source hashes, internal product IDs,
 -- customer identifiers, key references, or encrypted delivery components.
 keys:=lower(v::text);
 if keys like '%key_reference%'
    or keys like '%ciphertext%'
    or keys like '%nonce%'
    or keys like '%auth_tag%'
    or keys like '%source_sha256%'
    or keys like '%source_line_sha256%'
    or keys like '%recipient%'
    or keys like '%address%'
    or keys like '%email%'
    or keys like '%phone%'
    or keys like '%product_id%'
 then raise exception 'Supplier detail projection leaked private fields';end if;

 v:=public.get_supplier_held_order_details(
  '62000000-0000-0000-0000-000000000001',1,0);
 if v->>'has_more'<>'true' or jsonb_array_length(v->'orders')<>1
 or v->'orders'->0->>'order_reference'<>'APEX-HELD-INCOMPLETE-214'
 then raise exception 'Supplier first page incorrect';end if;
 v:=public.get_supplier_held_order_details(
  '62000000-0000-0000-0000-000000000001',1,1);
 if v->>'has_more'<>'false' or jsonb_array_length(v->'orders')<>1
 or v->'orders'->0->>'order_reference'<>'APEX-HELD-WORKER-SYNTH-A'
 then raise exception 'Supplier second page incorrect';end if;
 denied:=false;
 begin
  perform public.get_supplier_held_order_details(
  '62000000-0000-0000-0000-000000000001',51,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unbounded supplier row fetch allowed';end if;
 denied:=false;
 begin
  perform public.get_supplier_held_order_details(
  '62000000-0000-0000-0000-000000000001',25,-1);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Negative pagination accepted';end if;
 denied:=false;
 begin
  perform 1 from apex_internal.order_line_snapshots limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier bypassed restricted projection';end if;
end $member$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $cross$
declare denied boolean:=false;
begin
 begin
  perform public.get_supplier_held_order_details(
   '62000000-0000-0000-0000-000000000001',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-supplier details were readable';end if;
end $cross$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $anonymous_account$
declare denied boolean:=false;
begin
 begin
  perform public.get_supplier_held_order_details(
   '62000000-0000-0000-0000-000000000001',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous Supabase user read supplier detail';end if;
end $anonymous_account$;
rollback;

begin;
set local role anon;
do $public_access$
declare denied boolean:=false;
begin
 begin
  perform public.get_supplier_held_order_details(
    '62000000-0000-0000-0000-000000000001',25,0);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anon caller read supplier detail';end if;
end $public_access$;
rollback;

do $postflight$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots h
  where h.sale_id='65000814-0000-4000-8000-000000000001')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Supplier detail test mutated production-like state';end if;
end $postflight$;
select 'PASS: supplier-specific order lines, incomplete hold, pagination, no PII and cross-role privacy';
