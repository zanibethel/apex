-- Issue #214 Phase 6: synthetic, transactional journal/recovery tests.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 or to_regclass('apex_internal.held_order_source_deliveries') is null
 then raise exception 'Source receipt tests cannot leave disposable DB';end if;
end $preflight$;
begin;
-- A historical sale with no order lines/address: readback must never invent it.
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000714-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'APEX-UNVERIFIED-RECEIPT-214','confirmed',8900,'USD',
 '2026-11-04 12:45:00+00');

do $checks$
declare
 v_store uuid:='62000000-0000-0000-0000-000000000001';
 v_sale_held uuid:='65000614-0000-4000-8000-000000000001';
 v_sale_pending uuid:='65000714-0000-4000-8000-000000000001';
 v_hash_held text:=repeat('f',64);
 v_hash_pending text:=repeat('d',64);
 v_result jsonb;
 v_id uuid;
 denied boolean;
begin
 -- Prior Phase 4 worker had already placed a held, sealed, atomic order.
 if not exists(select 1 from apex_internal.order_detail_snapshots h
  where h.sale_id=v_sale_held and h.store_id=v_store
   and h.source_event_sha256=v_hash_held)
 then raise exception 'Expected trusted prior held snapshot fixture';end if;

 v_result:=apex_internal.note_unverified_source_delivery(
  v_store,v_sale_held,'CI-DELIVERY-214-A',v_hash_held);
 if v_result->>'status'<>'unverified_received'
 or v_result->>'source_verified'<>'false'
 or v_result->>'can_create_order'<>'false'
 or v_result->>'can_ship'<>'false'
 then raise exception 'New source receipt gained false authority';end if;
 v_id:=(v_result->>'delivery_id')::uuid;
 v_result:=apex_internal.note_unverified_source_delivery(
  v_store,v_sale_held,'CI-DELIVERY-214-A',v_hash_held);
 if v_result->>'status'<>'identical_delivery'
 or (v_result->>'delivery_id')::uuid<>v_id
 then raise exception 'Identical delivery replay was not suppressed';end if;

 v_result:=apex_internal.review_source_delivery_readback(v_store,'CI-DELIVERY-214-A');
 if v_result->>'status'<>'held_snapshot_observed'
 or v_result->>'can_retry_order_write'<>'false'
 or v_result->>'source_verified'<>'false'
 then raise exception 'Held readback improperly authorized order source';end if;
 -- Recovery readback must itself be idempotent: one event per delivery.
 perform apex_internal.review_source_delivery_readback(v_store,'CI-DELIVERY-214-A');
 if (select count(*) from apex_internal.held_order_source_recovery_events
  where delivery_id=v_id and event_type='held_snapshot_readback')<>1
 then raise exception 'Repeated readback duplicated an immutable event';end if;

 -- Same sale/hash, distinct authorized delivery reference is journaled once,
 -- but it is never a new order or a new source attestation.
 v_result:=apex_internal.note_unverified_source_delivery(
  v_store,v_sale_held,'CI-DELIVERY-214-REDRIVE',v_hash_held);
 if v_result->>'status'<>'unverified_received'
 then raise exception 'Distinct redelivery ID not recorded';end if;
 v_result:=apex_internal.review_source_delivery_readback(v_store,
   'CI-DELIVERY-214-REDRIVE');
 if v_result->>'status'<>'held_snapshot_observed'
 then raise exception 'Re-delivery readback did not recognize same held order';end if;

 -- Conflicts, even across different delivery IDs, cannot replace sale hash.
 denied:=false;
 begin
  perform apex_internal.note_unverified_source_delivery(
   v_store,v_sale_held,'CI-DELIVERY-214-CHANGED',repeat('e',64));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Changed source hash accepted as a new delivery';end if;
 denied:=false;
 begin
  perform apex_internal.note_unverified_source_delivery(
   v_store,v_sale_pending,'CI-DELIVERY-214-A',v_hash_pending);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Delivery reference reassigned to different sale';end if;

 -- The unverified source without complete lines/delivery cannot be retried.
 v_result:=apex_internal.note_unverified_source_delivery(
  v_store,v_sale_pending,'CI-DELIVERY-214-PENDING',v_hash_pending);
 if v_result->>'status'<>'unverified_received' then
  raise exception 'Pending source receipt not captured';end if;
 v_result:=apex_internal.review_source_delivery_readback(
  v_store,'CI-DELIVERY-214-PENDING');
 if v_result->>'status'<>'requires_independent_source_attestation'
 or v_result->>'can_create_order'<>'false'
 or v_result->>'can_retry_order_write'<>'false'
 then raise exception 'Unverified incomplete sale was falsely recovered';end if;
 if exists(select 1 from apex_internal.order_detail_snapshots
   where sale_id=v_sale_pending)
 then raise exception 'Journal created order header from unverified receipt';end if;

 -- Cross-tenant historical sale cannot enter a differently scoped journal.
 denied:=false;
 begin
  perform apex_internal.note_unverified_source_delivery(
   '62000000-0000-0000-0000-000000000002',v_sale_pending,
   'CI-CROSS-STORE',v_hash_pending);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Wrong supplier received a source identity';end if;
 denied:=false;
 begin
  perform apex_internal.review_source_delivery_readback(
  '62000000-0000-0000-0000-000000000002','CI-DELIVERY-214-A');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Wrong supplier can read recovery journal';end if;

 denied:=false;
 begin
  update apex_internal.held_order_source_deliveries
  set delivery_reference='ALTERED' where id=v_id;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Source identity became mutable';end if;
 denied:=false;
 begin
  delete from apex_internal.held_order_source_recovery_events where delivery_id=v_id;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Source audit event became deletable';end if;

 if (select count(*) from apex_internal.held_order_source_claims)<>2
 or (select count(*) from apex_internal.held_order_source_deliveries)<>3
 or (select count(*) from apex_internal.held_order_source_recovery_events)<>5
 then raise exception 'Expected only two source claims and three immutable deliveries';end if;

 if exists(select 1 from information_schema.columns
 where table_schema='apex_internal'
 and table_name in ('held_order_source_claims','held_order_source_deliveries',
                    'held_order_source_recovery_events')
 and column_name ~* '(address|recipient|phone|email|raw|cipher|signature|secret|key)')
 then raise exception 'Source receipt journal contains prohibited customer data';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Source journal unexpectedly activated commerce';end if;
end $checks$;

-- Anonymous and standard supplier roles cannot inspect or execute journal.
set local role authenticated;
do $rolechecks$
declare denied boolean:=false;
begin
 begin
  perform apex_internal.note_unverified_source_delivery(
   '62000000-0000-0000-0000-000000000001',
   '65000614-0000-4000-8000-000000000001',
   'CLIENT-SPOOF',repeat('f',64));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Authenticated client could journal unverified source';end if;
 denied:=false;
 begin perform 1 from apex_internal.held_order_source_deliveries limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Authenticated client could read source journal';end if;
end $rolechecks$;
rollback;
do $final$
begin
 if exists(select 1 from apex_internal.held_order_source_claims)
 or exists(select 1 from apex_internal.held_order_source_deliveries)
 or exists(select 1 from apex_internal.held_order_source_recovery_events)
 or (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 then raise exception 'Source journal fixture did not rollback fully';end if;
end $final$;
select 'PASS: exact duplicate source identity, safe readback, conflict holds, tenant isolation, immutable recovery and rollback';
