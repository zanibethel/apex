-- Issue #214 phase 3. Disposable PostgreSQL, synthetic records only.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or has_function_privilege('authenticated',
  'apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('anon',
  'apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'Atomic held intake test requires private disposable database'; end if;
end $preflight$;

begin;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at
) values
 ('65000314-0000-4000-8000-000000000001','62000000-0000-0000-0000-000000000001',
  'APEX-SYNTH-314-A','confirmed',10500,'USD','2026-11-04 10:00:00+00'),
 ('65000314-0000-4000-8000-000000000002','62000000-0000-0000-0000-000000000001',
  'APEX-SYNTH-314-B','confirmed',10500,'USD','2026-11-04 11:00:00+00');

do $test$
declare
 h jsonb;
 b jsonb;
 lines jsonb;
 dest jsonb;
 accounting jsonb;
 result jsonb;
 original_order uuid;
 denied boolean;
 begin_audit integer;
begin
 h:=jsonb_build_object(
  'store_id','62000000-0000-0000-0000-000000000001',
  'sale_id','65000314-0000-4000-8000-000000000001',
  'source_order_reference','APEX-SYNTH-314-A',
  'original_purchased_at','2026-11-04T10:00:00Z',
  'source_payment_state','confirmed','source_gross_cents',10500,
  'currency','USD','source_event_sha256',repeat('a',64),
  'record_status','held_unverified',
  'fulfillment_authorized',false,'payment_authorized',false);
 lines:=jsonb_build_array(
  jsonb_build_object('store_id','62000000-0000-0000-0000-000000000001',
    'source_line_reference','line-1','line_number',1,
    'product_id','64000000-0000-0000-0000-000000000001',
    'sku_at_purchase','SYNTH-1','title_at_purchase','Nonmedical synthetic sample',
    'variant_at_purchase','','quantity',2,'unit_price_cents',4000,
    'currency','USD','source_line_sha256',repeat('b',64),
    'product_eligibility','not_verified','shipping_authorized',false),
  jsonb_build_object('store_id','62000000-0000-0000-0000-000000000001',
    'source_line_reference','line-2','line_number',2,
    'product_id','64000000-0000-0000-0000-000000000001',
    'sku_at_purchase','SYNTH-2','title_at_purchase','Second synthetic sample',
    'variant_at_purchase','two-pack','quantity',1,'unit_price_cents',2000,
    'currency','USD','source_line_sha256',repeat('c',64),
    'product_eligibility','not_verified','shipping_authorized',false)
 );
 accounting:=jsonb_build_object(
  'line_subtotal_cents',10000,'shipping_cents',1500,
  'discount_cents',1000,'source_gross_cents',10500);
 dest:=jsonb_build_object(
  'store_id','62000000-0000-0000-0000-000000000001',
  'envelope_format','aes-256-gcm-v1',
  'key_reference','synthetic_ci_key_only',
  'nonce_base64',replace(encode(decode(repeat('01',12),'hex'),'base64'),chr(10),''),
  'ciphertext_base64',replace(encode(decode(repeat('ab',120),'hex'),'base64'),chr(10),''),
  'auth_tag_base64',replace(encode(decode(repeat('f0',16),'hex'),'base64'),chr(10),''),
  'delivery_verified',false,'shipping_authorized',false);

 result:=apex_internal.persist_held_order_snapshot(h,lines,dest,accounting);
 if result->>'status'<>'new' or result->>'held_only'<>'true'
 then raise exception 'Atomic held snapshot did not create';end if;
 original_order:=(result->>'order_id')::uuid;
 if (select count(*) from apex_internal.order_detail_snapshots where id=original_order)<>1
 or (select count(*) from apex_internal.order_line_snapshots where order_id=original_order)<>2
 or (select count(*) from apex_internal.order_delivery_envelopes where order_id=original_order)<>1
 or (select count(*) from apex_internal.held_order_intake_accounting where order_id=original_order
  and expected_line_count=2 and line_subtotal_cents=10000
  and shipping_cents=1500 and discount_cents=1000 and source_gross_cents=10500)<>1
 or (select count(*) from apex_internal.held_order_intake_audit
      where order_id=original_order and event_type='snapshot_held')<>1
 then raise exception 'Atomic header/lines/delivery/accounting/audit incomplete';end if;

 -- Same signed event may be re-encrypted with a different random nonce.
 -- It is still one immutable source order; encrypted destination is not changed.
 result:=apex_internal.persist_held_order_snapshot(h,lines,
  jsonb_set(dest,'{nonce_base64}',to_jsonb(
    replace(encode(decode(repeat('02',12),'hex'),'base64'),chr(10),''))),
  accounting);
 if result->>'status'<>'identical_replay'
 or (result->>'order_id')::uuid<>original_order
 or (select count(*) from apex_internal.held_order_intake_audit where order_id=original_order)<>1
 or (select encode(nonce,'hex') from apex_internal.order_delivery_envelopes
     where order_id=original_order)<>repeat('01',12)
 then raise exception 'Idempotent replay changed immutable order or audit';end if;

 -- Conflicting source event hash must fail without mutations.
 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   jsonb_set(h,'{source_event_sha256}',to_jsonb(repeat('d',64))),
   lines,dest,accounting);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Conflicting same-sale replay accepted';end if;

 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   h,jsonb_set(lines,'{1,quantity}','3'::jsonb),dest,accounting);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Changed line quantity accepted';end if;

 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   h,lines,dest,jsonb_set(accounting,'{discount_cents}','0'::jsonb));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Wrong shipping/discount accounting accepted';end if;

 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   h,lines,jsonb_set(dest,'{ciphertext_base64}',to_jsonb('bad base64')),accounting);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Malformed encrypted destination accepted';end if;

 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   h,lines,jsonb_set(dest,'{delivery_verified}','true'::jsonb),accounting);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Unverified delivery gained verification privilege';end if;

 -- Second synthetic source tests rollback after the first line was inserted.
 b:=h||jsonb_build_object(
  'sale_id','65000314-0000-4000-8000-000000000002',
  'source_order_reference','APEX-SYNTH-314-B',
  'original_purchased_at','2026-11-04T11:00:00Z',
  'source_event_sha256',repeat('e',64));
 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   b,
   jsonb_set(lines,'{1,product_id}',
    to_jsonb('64000000-0000-0000-0000-000000000099'::text)),
   dest,accounting);
 exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Foreign product reference was accepted';end if;
 if exists(select 1 from apex_internal.order_detail_snapshots
   where sale_id='65000314-0000-4000-8000-000000000002')
 or (select count(*) from apex_internal.order_line_snapshots)<>2
 or (select count(*) from apex_internal.order_delivery_envelopes)<>1
 or (select count(*) from apex_internal.held_order_intake_accounting)<>1
 or (select count(*) from apex_internal.held_order_intake_audit)<>1
 then raise exception 'Failed second order left partial rows';end if;

 denied:=false;
 begin
  perform apex_internal.persist_held_order_snapshot(
   b,lines,
   jsonb_set(dest,'{store_id}',to_jsonb(
    '62000000-0000-0000-0000-000000000002'::text)),accounting);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Wrong supplier destination accepted';end if;

 -- Separate payment, fulfillment and inventory state never changed.
 if exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Atomic intake activated commerce';end if;

 -- No mutable historical purchases, line snapshots or accounting.
 denied:=false;
 begin
  update apex_internal.held_order_intake_accounting
   set shipping_cents=0 where order_id=original_order;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Historical accounting became mutable';end if;
end $test$;

-- Authenticated user cannot call private writer or read its internal ledger.
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
do $denied$
declare refused boolean:=false;
begin
 begin
  perform apex_internal.persist_held_order_snapshot(
   '{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb);
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Supplier role executed private writer';end if;
end $denied$;
rollback;

do $final$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots)
 or exists(select 1 from apex_internal.order_line_snapshots)
 or exists(select 1 from apex_internal.order_delivery_envelopes)
 or exists(select 1 from apex_internal.held_order_intake_accounting)
 or exists(select 1 from apex_internal.held_order_intake_audit)
 or (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 then raise exception 'Synthetic atomic intake did not fully rollback';end if;
end $final$;
select 'PASS: atomic held order persistence, replay, rollback, immutable audit and auth denial';
