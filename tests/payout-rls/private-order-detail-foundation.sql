-- Issue #214 phase 1. Disposable PostgreSQL database only.
-- Synthetic sale, products, and opaque ciphertext are rolled back.
\set ON_ERROR_STOP on
do $safety$
begin
 if current_database()<>'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or has_table_privilege('authenticated','apex_internal.order_detail_snapshots','SELECT')
  or has_table_privilege('authenticated','apex_internal.order_line_snapshots','INSERT')
  or has_table_privilege('authenticated','apex_internal.order_delivery_envelopes','SELECT')
  or has_function_privilege('anon',
   'public.get_supplier_order_detail_foundation(uuid)','EXECUTE')
 then raise exception 'Order-detail test requires private, gated disposable database';end if;
end $safety$;

begin;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at
) values(
 '65000214-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'APEX-SYNTH-214-A','confirmed',12500,'USD','2026-11-03 18:30:00+00'),
 (
 '65000214-0000-4000-8000-000000000002',
 '62000000-0000-0000-0000-000000000001',
 'APEX-SYNTH-214-B','pending',2100,'USD','2026-11-04 12:10:00+00'
 );

insert into apex_internal.order_detail_snapshots(
 id,store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256
) values(
 '66000214-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '65000214-0000-4000-8000-000000000001',
 'APEX-SYNTH-214-A','2026-11-03 18:30:00+00',
 'confirmed',12500,repeat('a',64)
 );

insert into apex_internal.order_line_snapshots(
 id,order_id,store_id,source_line_reference,line_number,product_id,
 sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256
) values(
 '67000214-0000-4000-8000-000000000001',
 '66000214-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001','line-1',1,
 '64000000-0000-0000-0000-000000000001',
 'SYNTH-RELEASE-1','Synthetic nonmedical sample',2,5000,repeat('b',64)
 ),(
 '67000214-0000-4000-8000-000000000002',
 '66000214-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001','line-2',2,
 '64000000-0000-0000-0000-000000000001',
 'SYNTH-RELEASE-1','Synthetic second line',1,2500,repeat('c',64)
 );

insert into apex_internal.order_delivery_envelopes(
 order_id,store_id,key_reference,nonce,ciphertext,auth_tag
) values (
 '66000214-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'ci_dummy_key_ref',decode(repeat('01',12),'hex'),
 decode(repeat('ab',32),'hex'),decode(repeat('f1',16),'hex')
);
-- Synthetic byte arrays above are not real encrypted customer records
-- and should never be used in a production ingestion controller.

do $verified$
declare denied boolean:=false;v_order uuid:=
 '66000214-0000-4000-8000-000000000001';
 v_store uuid:='62000000-0000-0000-0000-000000000001';
begin
 if (select sum(line_subtotal_cents) from apex_internal.order_line_snapshots
  where order_id=v_order)<>12500
  or (select count(*) from apex_internal.order_line_snapshots where order_id=v_order)<>2
  or (select count(*) from apex_internal.order_delivery_envelopes where order_id=v_order)<>1
  or (select count(*) from apex_internal.order_detail_snapshots where store_id=v_store)<>1
 then raise exception 'Canonical lines/opaque delivery did not match snapshot';end if;

 -- Another row with the exact same store+sale cannot invent a new order ID.
 begin
  insert into apex_internal.order_detail_snapshots(
   store_id,sale_id,source_order_reference,original_purchased_at,
   source_payment_state,source_gross_cents,source_event_sha256
  ) values(v_store,'65000214-0000-4000-8000-000000000001',
   'APEX-SYNTH-214-A','2026-11-03 18:30:00+00','confirmed',12500,repeat('d',64));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Replay created a duplicate canonical order';end if;

 denied:=false;
 begin
  insert into apex_internal.order_detail_snapshots(
   store_id,sale_id,source_order_reference,original_purchased_at,
   source_payment_state,source_gross_cents,source_event_sha256
  ) values(v_store,'65000214-0000-4000-8000-000000000002',
    'APEX-SYNTH-214-B','2026-11-03 18:30:00+00','pending',2100,repeat('d',64));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Changed purchase timestamp accepted';end if;

 denied:=false;
 begin
  insert into apex_internal.order_detail_snapshots(
   store_id,sale_id,source_order_reference,original_purchased_at,
   source_payment_state,source_gross_cents,source_event_sha256
  ) values(v_store,'65000214-0000-4000-8000-000000000002',
    'APEX-SYNTH-214-B','2026-11-04 12:10:00+00','confirmed',2100,repeat('d',64));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'False verified payment state accepted';end if;

 denied:=false;
 begin
  insert into apex_internal.order_detail_snapshots(
   store_id,sale_id,source_order_reference,original_purchased_at,
   source_payment_state,source_gross_cents,source_event_sha256
  ) values(v_store,'65000214-0000-4000-8000-000000000002',
    'APEX-SYNTH-214-B','2026-11-04 12:10:00+00','pending',9999,repeat('d',64));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Tampered source payment amount accepted';end if;

 denied:=false;
 begin
  insert into apex_internal.order_line_snapshots(
   order_id,store_id,source_line_reference,line_number,product_id,
   sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256
  ) values(v_order,v_store,'line-1',3,
   '64000000-0000-0000-0000-000000000001',
   'SYNTH-RELEASE-1','Replay line',1,50,repeat('d',64));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Same source order line duplicated';end if;

 denied:=false;
 begin
  insert into apex_internal.order_line_snapshots(
   order_id,store_id,source_line_reference,line_number,product_id,
   sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256
  ) values(v_order,v_store,'line-3',3,
   '64000000-0000-0000-0000-000000000001',
   'SYNTH-RELEASE-1','Bad quantity',0,50,repeat('d',64));
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Invalid line quantity allowed';end if;

 denied:=false;
 begin
  insert into apex_internal.order_line_snapshots(
   order_id,store_id,source_line_reference,line_number,product_id,
   sku_at_purchase,title_at_purchase,quantity,unit_price_cents,source_line_sha256
  ) values(v_order,'62000000-0000-0000-0000-000000000002',
   'line-x',3,'64000000-0000-0000-0000-000000000001',
   'SYNTH-RELEASE-1','Wrong supplier line',1,50,repeat('d',64));
 exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Cross-store order line accepted';end if;

 denied:=false;
 begin update apex_internal.order_detail_snapshots
  set original_purchased_at=now() where id=v_order;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Original purchase time is mutable';end if;

 denied:=false;
 begin update apex_internal.order_line_snapshots
  set quantity=10 where order_id=v_order;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Historical purchased quantities are mutable';end if;

 denied:=false;
 begin delete from apex_internal.order_delivery_envelopes where order_id=v_order;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Sealed delivery records can be erased silently';end if;

 denied:=false;
 begin insert into apex_internal.order_delivery_envelopes(
  order_id,store_id,key_reference,nonce,ciphertext,auth_tag)
 values(v_order,v_store,'ci_dummy_key_ref',decode(repeat('01',12),'hex'),
  decode(repeat('ab',32),'hex'),decode(repeat('f1',16),'hex'));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Second destination for same order accepted';end if;
end $verified$;

-- Owner/staff sees counts only, no immutable keys or delivery data.
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
do $member$
declare v jsonb;
begin
 v:=public.get_supplier_order_detail_foundation(
  '62000000-0000-0000-0000-000000000001');
 if v->>'order_snapshots'<>'1'
  or v->>'line_snapshots'<>'2'
  or v->>'sealed_destinations'<>'1'
  or v->>'shipping_enabled'<>'false'
  or v->>'payment_enabled'<>'false'
  or v->>'order_ingest_enabled'<>'false'
  or v->>'delivery_decryption_enabled'<>'false'
  or (select count(*) from jsonb_object_keys(v))<>11
 then raise exception 'Supplier detail readiness is missing or leaks fields';end if;
end $member$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
do $cross$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_order_detail_foundation(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unrelated supplier saw private order counts';end if;
 denied:=false;
 begin
  insert into apex_internal.order_delivery_envelopes(
   order_id,store_id,key_reference,nonce,ciphertext,auth_tag)
  values(gen_random_uuid(),'62000000-0000-0000-0000-000000000001',
   'ci_dummy_key_ref',decode(repeat('01',12),'hex'),
   decode(repeat('ab',32),'hex'),decode(repeat('f1',16),'hex'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unrelated supplier wrote encrypted destination';end if;
end $cross$;
rollback;

begin;
set local role anon;
do $anonymous$
declare denied boolean:=false;
begin
 begin
  perform public.get_supplier_order_detail_foundation(
   '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous caller read order detail overview';end if;
end $anonymous$;
rollback;

do $final$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots)
  or exists(select 1 from apex_internal.order_line_snapshots)
  or exists(select 1 from apex_internal.order_delivery_envelopes)
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Fixture leaked orders, delivery or enabled checkout';end if;
 if exists (
  select 1 from information_schema.columns
  where table_schema='apex_internal' and table_name='order_delivery_envelopes'
   and column_name ~* '(address|recipient|phone|email|postal|zip|city)'
 ) then raise exception 'Plaintext delivery fields exposed in schema';end if;
end $final$;
select 'PASS: immutable verified-source order details, private sealed delivery, replay and tenant denials';
