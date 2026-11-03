-- PR #192: disposable quote-verifier & reservation lifecycle integration.
-- All temporary writes roll back. Real Apex order / inventory untouched.
\set ON_ERROR_STOP on
do $gate$
begin
 if current_database()<>'apex_test'
  or has_schema_privilege('anon','apex_test_reservation','USAGE')
  or has_schema_privilege('authenticated','apex_test_reservation','USAGE')
  or has_function_privilege('anon',
    'apex_test_reservation.reserve_with_verified_quotes(uuid,text,jsonb,text,text,text,bigint)',
    'EXECUTE')
  or has_function_privilege('authenticated',
    'apex_test_reservation.release_held_contract(uuid,uuid,text)',
    'EXECUTE')
 then raise exception 'Quote lifecycle fixture public privilege leak';end if;
end $gate$;

begin;
do $test$
declare
 v_store uuid:='77000000-0000-0000-0000-000000000001';
 v_items jsonb:='[{"product_id":"78000000-0000-0000-0000-000000000001","quantity":2}]';
 v_id uuid;
 v_id2 uuid;
 v_result jsonb;
 v_failed boolean;
 v_events integer;
begin
 -- A real hold can only be made using the separately recorded, unchanged
 -- quote evidence and matching trusted source references.
 v_result:=apex_test_reservation.reserve_with_verified_quotes(
  v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_result->>'state'<>'held_fixture_only'
  or v_result->>'can_pay'<>'false'
  or v_result->>'invoice_created'<>'false'
  or v_result->>'reservation_expires_at' is null
 then raise exception 'Verified quote reservation not held safely';end if;
 v_id:=(v_result->>'order_id')::uuid;
 if (select reserved from apex_test_reservation.inventory where
     product_id='78000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Held fixture failed to reserve two units';end if;
 if (select held_until from apex_test_reservation.orders where id=v_id)
   > now()+interval '16 minutes'
 then raise exception 'Quote-based reservation expiry unbounded';end if;
 v_result:=apex_test_reservation.reserve_with_verified_quotes(
  v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_result->>'state'<>'replayed_held'
  or v_result->>'order_id'<>v_id::text
  or (select reserved from apex_test_reservation.inventory where
     product_id='78000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Verified quote same-key replay changed stock';end if;

 -- Quote record changes must not be treated as independent provider evidence.
 update apex_test_reservation.shipping_quotes set amount_cents=701
  where quote_ref='ship-demo-1';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_with_verified_quotes(
   v_store,repeat('b',64),v_items,'ship-demo-1','tax-demo-1','TX',6051);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Tampered shipping quote was accepted';end if;
 update apex_test_reservation.shipping_quotes set amount_cents=700
  where quote_ref='ship-demo-1';

 update apex_test_reservation.tax_quotes
  set expires_at=now()-interval '1 minute' where quote_ref='tax-demo-1';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_with_verified_quotes(
   v_store,repeat('c',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Quote expiry mismatched verification evidence';end if;
 update apex_test_reservation.tax_quotes
  set expires_at=(select expires_at from apex_test_reservation.provider_quote_evidence
    where kind='tax' and quote_ref='tax-demo-1')
  where quote_ref='tax-demo-1';

 -- Admitted quote evidence is immutable, including source and verifier.
 v_failed:=false;
 begin
  update apex_test_reservation.provider_quote_evidence
   set verification_status='rejected' where quote_ref='ship-demo-1';
 exception when sqlstate '55000' then v_failed:=true;end;
 if not v_failed then raise exception 'Verifier evidence was rewritten';end if;
 v_failed:=false;
 begin
  delete from apex_test_reservation.provider_quote_evidence
   where quote_ref='tax-demo-1';
 exception when sqlstate '55000' then v_failed:=true;end;
 if not v_failed then raise exception 'Verifier evidence could be deleted';end if;

 -- Fail closed when a shipping quote has NO independent verification receipt.
 insert into apex_test_reservation.shipping_quotes(
  quote_ref,store_id,cart_fingerprint,destination_region,amount_cents,
  approved,expires_at)
 select 'ship-unverified',store_id,cart_fingerprint,destination_region,
  amount_cents,approved,expires_at
 from apex_test_reservation.shipping_quotes where quote_ref='ship-demo-1';
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_with_verified_quotes(
   v_store,repeat('d',64),v_items,'ship-unverified','tax-demo-1','TX',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Unverified quote source accepted';end if;
 v_failed:=false;
 begin
  perform apex_test_reservation.reserve_with_verified_quotes(
   v_store,repeat('e',64),v_items,'ship-demo-1','tax-demo-1','CA',6050);
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Foreign delivery region accepted';end if;

 -- A normal cancellation releases stock exactly once and records the reason.
 v_result:=apex_test_reservation.release_held_contract(v_store,v_id,'cancel');
 if v_result->>'state'<>'cancelled_fixture_only'
  or v_result->>'released_now'<>'true'
 then raise exception 'Cancellation did not commit terminal state';end if;
 if (select reserved from apex_test_reservation.inventory where
   product_id='78000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Cancel did not release full stock';end if;
 v_result:=apex_test_reservation.release_held_contract(v_store,v_id,'cancel');
 if v_result->>'released_now'<>'false' or
   (select count(*) from apex_test_reservation.order_release_events
    where order_id=v_id)<>1
 then raise exception 'Duplicate cancellation emitted another release';end if;
 v_result:=apex_test_reservation.release_held_contract(v_store,v_id,'expire');
 if v_result->>'released_now'<>'false'
 then raise exception 'Terminal cancellation was changed to expiry';end if;
 v_result:=apex_test_reservation.reserve_with_verified_quotes(
  v_store,repeat('a',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_result->>'state'<>'replayed_cancelled_fixture_only'
  or (select reserved from apex_test_reservation.inventory where
   product_id='78000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Cancelled request was silently re-reserved';end if;

 -- A live hold cannot be expired before its deadline; a batch worker can
 -- expire a due hold once and cannot alter an already-cancelled order.
 v_result:=apex_test_reservation.reserve_with_verified_quotes(
  v_store,repeat('f',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 v_id2:=(v_result->>'order_id')::uuid;
 v_failed:=false;
 begin
  perform apex_test_reservation.release_held_contract(v_store,v_id2,'expire');
 exception when check_violation then v_failed:=true;end;
 if not v_failed then raise exception 'Future hold expired prematurely';end if;
 update apex_test_reservation.orders set held_until=now()-interval '1 minute'
  where id=v_id2 and state='held_fixture_only';
 if apex_test_reservation.expire_due_holds(20)<>1
 then raise exception 'Due-hold worker did not expire exactly one';end if;
 if apex_test_reservation.expire_due_holds(20)<>0
 then raise exception 'Due-hold worker reprocessed terminal reservation';end if;
 if (select state from apex_test_reservation.orders where id=v_id2)
  <>'expired_fixture_only'
  or (select count(*) from apex_test_reservation.order_release_events
    where order_id=v_id2)<>1
  or (select reserved from apex_test_reservation.inventory where
    product_id='78000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Expired reservation left stock or duplicate release';end if;
 v_result:=apex_test_reservation.reserve_with_verified_quotes(
  v_store,repeat('f',64),v_items,'ship-demo-1','tax-demo-1','TX',6050);
 if v_result->>'state'<>'replayed_expired_fixture_only'
 then raise exception 'Expired key could silently reserve stock again';end if;

 v_failed:=false;
 begin
  perform apex_test_reservation.release_held_contract(
   '77000000-0000-0000-0000-000000000002',v_id2,'cancel');
 exception when insufficient_privilege then v_failed:=true;end;
 if not v_failed then raise exception 'Cross-store order release allowed';end if;

 v_failed:=false;
 begin perform apex_test_reservation.expire_due_holds(0);
 exception when invalid_parameter_value then v_failed:=true;end;
 if not v_failed then raise exception 'Unbounded expiry batch accepted';end if;

 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Fixture altered real held-order journal';end if;
end $test$;
rollback;

do $post$
begin
 if exists(select 1 from apex_test_reservation.orders)
  or exists(select 1 from apex_test_reservation.order_release_events)
  or exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Lifecycle fixture left order or release records';end if;
 if exists(select 1 from apex_test_reservation.inventory where reserved<>0)
 then raise exception 'Lifecycle fixture failed rollback isolation';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false then raise exception 'Public release gate altered';end if;
end $post$;
select 'PASS: synthetic independent quote evidence, immutable receipt and one-shot expiry/cancel';
