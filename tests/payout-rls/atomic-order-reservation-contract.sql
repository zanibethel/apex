-- PR #191: synthetic-only contract verification. All mutations roll back.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
   or has_schema_privilege('anon','apex_test_reservation','USAGE')
   or has_schema_privilege('authenticated','apex_test_reservation','USAGE')
   or has_function_privilege('anon',
     'apex_test_reservation.reserve_held_contract(uuid,text,jsonb,text,text,text,bigint)',
     'EXECUTE')
 then raise exception 'Reservation test scope or privileges unsafe';end if;
end $preflight$;
begin;
do $test$
declare
 v_store uuid:='77000000-0000-0000-0000-000000000001';
 v_items jsonb:='[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":2}]';
 v_held jsonb;
 v_replay jsonb;
 v_failed boolean;
 v_count integer;
begin
 v_held:=apex_test_reservation.reserve_held_contract(
  v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_held->>'state'<>'held_fixture_only'
  or v_held->>'fixture_only'<>'true'
  or v_held->>'can_pay'<>'false'
  or v_held->>'invoice_created'<>'false'
  or v_held->>'total_cents'<>'6050'
 then raise exception 'Synthetic held reservation totals/flags invalid';end if;
 if (select count(*) from apex_test_reservation.orders)<>1
  or (select count(*) from apex_test_reservation.order_lines)<>1
  or (select reserved from apex_test_reservation.inventory where
   product_id='78000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Synthetic stock reservation did not write atomically';end if;
 v_replay:=apex_test_reservation.reserve_held_contract(
  v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_replay->>'state'<>'replayed_held'
  or v_replay->>'order_id'<>v_held->>'order_id'
  or (select count(*) from apex_test_reservation.orders)<>1
  or (select reserved from apex_test_reservation.inventory where
   product_id='78000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Idempotent replay duplicated stock or orders';end if;

 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6051);
 exception when unique_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Replay with changed total accepted';end if;

 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('b',64),v_items,'ship-demo-1','tax-demo-1','TX',6051);
 exception when invalid_parameter_value then v_failed:=true;end;
 if not v_failed then raise exception 'Stale browser total accepted';end if;

 update apex_test_reservation.shipping_quotes set approved=false
  where quote_ref='ship-demo-1';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('c',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Unapproved shipping quote accepted';end if;
 update apex_test_reservation.shipping_quotes set approved=true
  where quote_ref='ship-demo-1';

 update apex_test_reservation.tax_quotes
  set expires_at=now()-interval '1 minute' where quote_ref='tax-demo-1';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('d',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Expired tax quote accepted';end if;
 update apex_test_reservation.tax_quotes
  set expires_at=now()+interval '1 hour' where quote_ref='tax-demo-1';

 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('e',64),v_items,'ship-demo-1','tax-demo-1','CA',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Wrong destination region accepted';end if;

 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   '77000000-0000-0000-0000-000000000002',repeat('f',64),
    v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Cross-store quote accepted';end if;

 for v_count in 1..4 loop
  v_failed:=false;
  begin
   perform apex_test_reservation.reserve_held_contract(
    v_store,repeat('1',64),
    case v_count
     when 1 then '[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":0}]'::jsonb
     when 2 then '[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":2,"unit_price_cents":1}]'::jsonb
     when 3 then '[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":1},{"product_id":"78000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb
     else '[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":11}]'::jsonb
    end,'ship-demo-1','tax-demo-1','TX',6050);
  exception when invalid_parameter_value then v_failed:=true;end;
  if not v_failed then raise exception 'Malformed/duplicate cart accepted %',v_count;end if;
 end loop;

 -- A changed server-side price must invalidate the stale total.
 update apex_test_reservation.inventory set price_cents=2600
  where product_id='78000000-0000-0000-0000-000000000001';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('2',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when invalid_parameter_value then v_failed:=true;end;
 if not v_failed then raise exception 'Changed saved price was ignored';end if;
 update apex_test_reservation.inventory set price_cents=2500
  where product_id='78000000-0000-0000-0000-000000000001';

 -- Stock 5, two already held. A second two-unit hold works, third fails.
 perform apex_test_reservation.reserve_held_contract(
  v_store,repeat('3',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if (select reserved from apex_test_reservation.inventory where
  product_id='78000000-0000-0000-0000-000000000001')<>4
 then raise exception 'Second held reservation missing';end if;
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_held_contract(
   v_store,repeat('4',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Insufficient-stock reservation accepted';end if;

 if (select count(*) from apex_test_reservation.orders)<>2
  or (select count(*) from apex_test_reservation.order_lines)<>2
  or (select reserved from apex_test_reservation.inventory
     where product_id='78000000-0000-0000-0000-000000000001')<>4
 then raise exception 'Rejected request left partial state';end if;
 if exists(select 1 from apex_internal.checkout_order_intents)
   or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Synthetic reservation wrote real immutable order journal';end if;
end $test$;
rollback;
do $post$
begin
 if exists(select 1 from apex_test_reservation.orders)
  or exists(select 1 from apex_test_reservation.order_lines)
  or exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Test failed to leave empty journals';end if;
 if (select reserved from apex_test_reservation.inventory
  where product_id='78000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Synthetic rollback changed fixture inventory';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Synthetic reservation changed public release gate';end if;
end $post$;
select 'PASS: synthetic server pricing, quote binding, idem replay, rollback, no live writes';
