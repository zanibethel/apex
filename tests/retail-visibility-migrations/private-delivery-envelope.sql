-- Disposable PostgreSQL integration: held order + delivery must commit together.
-- All ciphertext and keys here are synthetic byte-pattern fixtures, NOT
-- encrypted addresses, real customer data, or usable delivery encryption.
do $$
begin
 if has_table_privilege('anon','apex_internal.retail_order_delivery_envelopes','SELECT')
  or has_table_privilege('authenticated','apex_internal.retail_order_delivery_envelopes','INSERT')
  or has_table_privilege('service_role','apex_internal.retail_order_delivery_envelopes','SELECT')
  or has_function_privilege('service_role',
    'apex_internal.attach_retail_delivery_envelope(uuid,uuid,text,bytea,bytea,bytea)','EXECUTE')
  or has_function_privilege('anon',
    'apex_internal.get_retail_order_hold_receipt(uuid,uuid)','EXECUTE')
 then raise exception 'Private envelope permissions leaked';end if;
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
  is distinct from false
 then raise exception 'Delivery migration activated production order engine';end if;
 if exists(select 1 from information_schema.columns where
  table_schema='apex_internal' and table_name='retail_order_delivery_envelopes'
  and column_name in ('email','name','phone','address1','postal_code','key'))
 then raise exception 'Plaintext contact/key fields in private envelope';end if;
end $$;

-- Only disposable DB tests enable the order engine. Product price is 3200
-- from earlier fixtures, USD 32 + USD 15 shipping => total USD 47.
update apex_internal.retail_order_engine_gate
 set enabled=true where singleton=true;

-- A previously valid lone hold may no longer COMMIT without encrypted
-- delivery. An immediate constraint check enforces the deferred contract and
-- causes the entire failed subtransaction to roll back stock and row inserts.
do $$
declare v_before integer;
begin
 select count(*) into v_before from apex_internal.retail_order_holds;
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000801',repeat('a',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
   '','auto',4700);
  set constraints all immediate;
  raise exception 'Expected unsealed hold rejection';
 exception when others then
  if SQLERRM='Expected unsealed hold rejection' then raise;end if;
  if SQLERRM not like '%missing sealed delivery%' then raise;end if;
 end;
 if (select count(*) from apex_internal.retail_order_holds)<>v_before or
   (select quantity_reserved from public.inventory_items where
    product_id='50000000-0000-4000-8000-000000000001')<>0
 then raise exception 'Unsealed hold left partial reserved stock';end if;
end $$;

-- Invalid envelope length must roll back the whole requested order, not leave
-- an order record with partial or missing delivery.
do $$
declare v_id uuid;v_before integer;
begin
 select count(*) into v_before from apex_internal.retail_order_holds;
 begin
  select (apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000802',repeat('b',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
   '','auto',4700)->>'order_id')::uuid into v_id;
  perform apex_internal.attach_retail_delivery_envelope(
   '10000000-0000-4000-8000-000000000001',v_id,
   'key_demo_1',decode('0102','hex'),
   decode(repeat('cd',32),'hex'),decode(repeat('ef',16),'hex'));
  raise exception 'Expected invalid envelope denial';
 exception when others then
  if SQLERRM='Expected invalid envelope denial' then raise;end if;
  if SQLERRM not like '%Invalid sealed delivery envelope%' then raise;end if;
 end;
 if (select count(*) from apex_internal.retail_order_holds)<>v_before or
   (select quantity_reserved from public.inventory_items where
    product_id='50000000-0000-4000-8000-000000000001')<>0
 then raise exception 'Bad encryption payload left partial order/stock';end if;
end $$;

-- Successful single-transaction reserve + opaque authenticated envelope.
do $$
declare
 v_hold jsonb;
 v_sealed jsonb;
 v_receipt jsonb;
 v_replay jsonb;
 v_order_id uuid;
begin
 v_hold:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000803',repeat('c',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
  '','auto',4700);
 v_order_id:=(v_hold->>'order_id')::uuid;
 v_sealed:=apex_internal.attach_retail_delivery_envelope(
  '10000000-0000-4000-8000-000000000001',v_order_id,
  'key_demo_1',decode(repeat('01',12),'hex'),
  decode(repeat('ab',32),'hex'),decode(repeat('cd',16),'hex'));
 v_receipt:=apex_internal.get_retail_order_hold_receipt(
  '10000000-0000-4000-8000-000000000001',v_order_id);
 if v_hold->>'status'<>'held_no_payment' or
    v_sealed->>'sealed'<>'true' or v_sealed->>'can_pay'<>'false' or
    v_receipt->>'delivery_sealed'<>'true' or
    v_receipt->>'total_cents'<>'4700' or
    v_receipt->>'payment_confirmed'<>'false' or
    v_receipt->>'can_pay'<>'false' or
    v_receipt->>'can_ship'<>'false' or
    v_receipt->>'line_count'<>'1' or
    v_receipt->>'status'<>'held_no_payment' or
    v_receipt->>'store_id'<>'10000000-0000-4000-8000-000000000001'
 then raise exception 'Sealed order readback has invalid state: %',v_receipt;end if;
 if v_receipt::text ~* '(email|phone|address|ciphertext|nonce|auth_tag|key_reference)'
 then raise exception 'Private receipt exposed customer data or encrypted bytes';end if;
 if (select quantity_reserved from public.inventory_items where
  product_id='50000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Sealed hold was not reserved';end if;

 -- Exact seal replay can be read repeatedly but never overwritten.
 v_replay:=apex_internal.attach_retail_delivery_envelope(
  '10000000-0000-4000-8000-000000000001',v_order_id,
  'key_demo_1',decode(repeat('01',12),'hex'),
  decode(repeat('ab',32),'hex'),decode(repeat('cd',16),'hex'));
 if v_replay->>'replayed'<>'true' then
  raise exception 'Identical seal replay should not reinsert';end if;
 -- Same original request replays without reserving another unit.
 v_replay:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000803',repeat('c',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
  '','auto',4700);
 if v_replay->>'replayed'<>'true' or v_replay->>'order_id'<>v_hold->>'order_id' then
  raise exception 'Sealed order was duplicated on retry';end if;
end $$;

-- The FK prevents an arbitrary guessed order/store cross-binding.
do $$
declare v_order_id uuid;
begin
 select id into v_order_id from apex_internal.retail_order_holds
 where request_id='80000000-0000-4000-8000-000000000803';
 begin
  perform apex_internal.attach_retail_delivery_envelope(
   '10000000-0000-4000-8000-000000000002',v_order_id,
   'key_demo_1',decode(repeat('02',12),'hex'),
   decode(repeat('ff',32),'hex'),decode(repeat('cd',16),'hex'));
  raise exception 'Expected cross-store delivery denial';
 exception when others then
  if SQLERRM='Expected cross-store delivery denial' then raise;end if;
  if SQLERRM not like '%Active order hold unavailable%' then raise;end if;
 end;
 begin
  perform apex_internal.attach_retail_delivery_envelope(
   '10000000-0000-4000-8000-000000000001',v_order_id,
   'key_demo_1',decode(repeat('02',12),'hex'),
   decode(repeat('ff',32),'hex'),decode(repeat('cd',16),'hex'));
  raise exception 'Expected changed envelope replay denial';
 exception when others then
  if SQLERRM='Expected changed envelope replay denial' then raise;end if;
  if SQLERRM not like '%already sealed%' then raise;end if;
 end;
 begin
  update apex_internal.retail_order_delivery_envelopes
   set ciphertext=decode(repeat('ff',32),'hex') where order_id=v_order_id;
  raise exception 'Expected immutable envelope rejection';
 exception when others then
  if SQLERRM='Expected immutable envelope rejection' then raise;end if;
  if SQLERRM not like '%envelopes are immutable%' then raise;end if;
 end;
end $$;

-- Existing terminal stock release remains exact and the private receipt
-- must never be mistaken for payment or shipping authorization.
do $$
declare v_order_id uuid;v_cancel jsonb;v_receipt jsonb;
begin
 select id into v_order_id from apex_internal.retail_order_holds
 where request_id='80000000-0000-4000-8000-000000000803';
 v_cancel:=apex_internal.end_retail_order_hold(
  v_order_id,'cancel','Synthetic customer cancelled');
 v_receipt:=apex_internal.get_retail_order_hold_receipt(
  '10000000-0000-4000-8000-000000000001',v_order_id);
 if v_cancel->>'status'<>'cancelled_no_payment' or
    v_receipt->>'status'<>'cancelled_no_payment' or
    v_receipt->>'delivery_sealed'<>'true' or
    v_receipt->>'can_pay'<>'false' or v_receipt->>'can_ship'<>'false' or
    (select quantity_reserved from public.inventory_items where
     product_id='50000000-0000-4000-8000-000000000001')<>0
 then raise exception 'Cancelled sealed order did not restore stock';end if;
end $$;

update apex_internal.retail_order_engine_gate set enabled=false where singleton=true;
do $$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
    is distinct from false or
    exists(select 1 from apex_internal.retail_order_holds where state='held_no_payment')
 then raise exception 'Fixture left an active delivery/order state';end if;
end $$;
