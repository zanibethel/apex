-- Executed in CI through an actual NOINHERIT PostgreSQL login only.
\set ON_ERROR_STOP on
do $test$
declare
 h jsonb;
 lines jsonb;
 envelope jsonb;
 totals jsonb;
 result jsonb;
 canonical_order uuid;
 refused boolean;
 store_id uuid:='62000000-0000-0000-0000-000000000001';
begin
 if session_user<>'apex_test_held_order_worker'
    or current_user<>'apex_test_held_order_worker'
 then raise exception 'Dedicated PostgreSQL login required'; end if;
 refused:=false;
 begin perform 1 from apex_internal.order_detail_snapshots limit 1;
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Direct private order read permitted';end if;
 refused:=false;
 begin perform apex_internal.persist_held_order_snapshot(
  '{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb);
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Base persistence bypass was permitted';end if;

 h:=jsonb_build_object(
 'store_id',store_id,'sale_id','65000614-0000-4000-8000-000000000001',
 'source_order_reference','APEX-HELD-WORKER-SYNTH-A',
 'original_purchased_at','2026-11-04T10:00:00Z',
 'source_payment_state','confirmed','source_gross_cents',10500,
 'currency','USD','source_event_sha256',repeat('f',64),
 'record_status','held_unverified',
 'fulfillment_authorized',false,'payment_authorized',false);
 lines:=jsonb_build_array(
 jsonb_build_object('store_id',store_id,
 'source_line_reference','worker-line-1','line_number',1,
 'product_id','64000000-0000-0000-0000-000000000001',
 'sku_at_purchase','SYNTH-1','title_at_purchase','Synthetic sample',
 'variant_at_purchase','','quantity',2,'unit_price_cents',4000,
 'currency','USD','source_line_sha256',repeat('a',64),
 'product_eligibility','not_verified','shipping_authorized',false),
 jsonb_build_object('store_id',store_id,
 'source_line_reference','worker-line-2','line_number',2,
 'product_id','64000000-0000-0000-0000-000000000001',
 'sku_at_purchase','SYNTH-2','title_at_purchase','Synthetic sample two',
 'variant_at_purchase','','quantity',1,'unit_price_cents',2000,
 'currency','USD','source_line_sha256',repeat('b',64),
 'product_eligibility','not_verified','shipping_authorized',false));
 envelope:=jsonb_build_object('store_id',store_id,
 'envelope_format','aes-256-gcm-v1','key_reference','ci_dummy_key_no_pii',
 'nonce_base64',replace(encode(decode(repeat('01',12),'hex'),'base64'),chr(10),''),
 'ciphertext_base64',replace(encode(decode(repeat('aa',120),'hex'),'base64'),chr(10),''),
 'auth_tag_base64',replace(encode(decode(repeat('02',16),'hex'),'base64'),chr(10),''),
 'delivery_verified',false,'shipping_authorized',false);
 totals:=jsonb_build_object('line_subtotal_cents',10000,
 'shipping_cents',1500,'discount_cents',1000,'source_gross_cents',10500);

 result:=apex_test_order_worker.commit_attested_held_order(
  '69000614-0000-4000-8000-000000000001',h,lines,envelope,totals);
 if result->>'status'<>'new' or result->>'held_only'<>'true'
 then raise exception 'Attested source worker did not create held record';end if;
 canonical_order:=(result->>'order_id')::uuid;
 refused:=false;
 begin perform apex_test_order_worker.commit_attested_held_order(
 '69000614-0000-4000-8000-000000000001',h,lines,envelope,totals);
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Consumed permit replay accepted';end if;

 result:=apex_test_order_worker.commit_attested_held_order(
 '69000614-0000-4000-8000-000000000002',h,lines,envelope,totals);
 if result->>'status'<>'identical_replay' or
 (result->>'order_id')::uuid<>canonical_order
 then raise exception 'Duplicate event was not idempotent';end if;

 refused:=false;
 begin perform apex_test_order_worker.commit_attested_held_order(
 '69000614-0000-4000-8000-000000000003',h,
 jsonb_set(lines,'{1,quantity}','3'::jsonb),envelope,totals);
 exception when check_violation then refused:=true;end;
 if not refused then raise exception 'Mismatched item total accepted';end if;
 perform apex_test_order_worker.record_held_order_denial(
  store_id,repeat('f',64),'invalid_payload');

 refused:=false;
 begin perform apex_test_order_worker.commit_attested_held_order(
 '69000614-0000-4000-8000-000000000004',h,lines,envelope,totals);
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Expired attestation accepted';end if;

 refused:=false;
 begin perform apex_test_order_worker.commit_attested_held_order(
 '69000614-0000-4000-8000-000000000003',
 jsonb_set(h,'{store_id}',to_jsonb(
 '62000000-0000-0000-0000-000000000002'::text)),
 lines,envelope,totals);
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Wrong supplier permitted';end if;

 refused:=false;
 begin perform apex_test_order_worker.record_held_order_denial(
 '62000000-0000-0000-0000-000000000002',
 repeat('f',64),'invalid_signature');
 exception when insufficient_privilege then refused:=true;end;
 if not refused then raise exception 'Wrong supplier audit permitted';end if;

 refused:=false;
 begin perform apex_test_order_worker.record_held_order_denial(
 store_id,repeat('f',64),'unrecognized_code');
 exception when invalid_parameter_value then refused:=true;end;
 if not refused then raise exception 'Unrecognized denial metadata accepted';end if;
end $test$;
select 'PASS: authenticated test worker one-use permit, idempotent replay, denial audit';
