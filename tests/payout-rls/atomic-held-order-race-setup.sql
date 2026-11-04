-- Disposable CI-only concurrent replay fixture. Run after all other RLS tests.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test'
 or (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 then raise exception 'Concurrency fixture must never run outside isolated CI';end if;
end $guard$;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000414-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'APEX-SYNTH-RACE-314','confirmed',10500,'USD',
 '2026-11-04 12:00:00+00');
create function apex_internal.ci_only_held_order_race()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_header jsonb; v_lines jsonb; v_dest jsonb; v_accounting jsonb;
begin
 if current_database()<>'apex_test' then
  raise exception 'CI fixture refused outside apex_test';end if;
 v_header:=jsonb_build_object(
  'store_id','62000000-0000-0000-0000-000000000001',
  'sale_id','65000414-0000-4000-8000-000000000001',
  'source_order_reference','APEX-SYNTH-RACE-314',
  'original_purchased_at','2026-11-04T12:00:00Z',
  'source_payment_state','confirmed','source_gross_cents',10500,
  'currency','USD','source_event_sha256',repeat('f',64),
  'record_status','held_unverified',
  'fulfillment_authorized',false,'payment_authorized',false);
 v_lines:=jsonb_build_array(
  jsonb_build_object(
   'store_id','62000000-0000-0000-0000-000000000001',
   'source_line_reference','race-line-1','line_number',1,
   'product_id','64000000-0000-0000-0000-000000000001',
   'sku_at_purchase','SYNTH-RACE-1','title_at_purchase','Synthetic sample',
   'variant_at_purchase','','quantity',2,'unit_price_cents',4000,
   'currency','USD','source_line_sha256',repeat('1',64),
   'product_eligibility','not_verified','shipping_authorized',false),
  jsonb_build_object(
   'store_id','62000000-0000-0000-0000-000000000001',
   'source_line_reference','race-line-2','line_number',2,
   'product_id','64000000-0000-0000-0000-000000000001',
   'sku_at_purchase','SYNTH-RACE-2','title_at_purchase','Synthetic sample 2',
   'variant_at_purchase','','quantity',1,'unit_price_cents',2000,
   'currency','USD','source_line_sha256',repeat('2',64),
   'product_eligibility','not_verified','shipping_authorized',false));
 v_dest:=jsonb_build_object(
  'store_id','62000000-0000-0000-0000-000000000001',
  'envelope_format','aes-256-gcm-v1','key_reference','ci_synthetic_key',
  'nonce_base64',replace(encode(decode(repeat('01',12),'hex'),'base64'),chr(10),''),
  'ciphertext_base64',replace(encode(decode(repeat('ab',120),'hex'),'base64'),chr(10),''),
  'auth_tag_base64',replace(encode(decode(repeat('f0',16),'hex'),'base64'),chr(10),''),
  'delivery_verified',false,'shipping_authorized',false);
 v_accounting:=jsonb_build_object(
  'line_subtotal_cents',10000,'shipping_cents',1500,
  'discount_cents',1000,'source_gross_cents',10500);
 return apex_internal.persist_held_order_snapshot(
  v_header,v_lines,v_dest,v_accounting);
end $fn$;
revoke all on function apex_internal.ci_only_held_order_race()
from public,anon,authenticated;
