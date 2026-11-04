-- Admin-side postflight after a real dedicated LOGIN worker session.
\set ON_ERROR_STOP on
do $postflight$
declare
 v_sale uuid:='65000614-0000-4000-8000-000000000001';
 v_store uuid:='62000000-0000-0000-0000-000000000001';
 v_order uuid;
 v_name text;
begin
 if current_database()<>'apex_test' then
  raise exception 'Order worker postflight is disposable only';end if;
 select id into v_order from apex_internal.order_detail_snapshots
 where sale_id=v_sale and store_id=v_store;
 if v_order is null
 or (select count(*) from apex_internal.order_detail_snapshots
     where sale_id=v_sale)<>1
 or (select count(*) from apex_internal.order_line_snapshots
     where order_id=v_order)<>2
 or (select count(*) from apex_internal.order_delivery_envelopes
     where order_id=v_order and store_id=v_store)<>1
 or (select count(*) from apex_internal.held_order_intake_accounting
     where order_id=v_order and source_gross_cents=10500)<>1
 or (select count(*) from apex_internal.held_order_intake_audit
     where order_id=v_order and event_type='snapshot_held')<>1
 then raise exception 'Worker produced incomplete or duplicate held snapshots';end if;
 if (select count(*) from apex_internal.held_order_source_permits
     where id in ('69000614-0000-4000-8000-000000000001',
                  '69000614-0000-4000-8000-000000000002')
       and consumed_at is not null)<>2
 or (select count(*) from apex_internal.held_order_source_permits
     where id in ('69000614-0000-4000-8000-000000000003',
                  '69000614-0000-4000-8000-000000000004')
       and consumed_at is null)<>2
 then raise exception 'Attestation one-use or rollback invariant failed';end if;
 if (select count(*) from apex_internal.held_order_denial_events
    where store_id=v_store and source_sha256=repeat('f',64)
      and denial_code='invalid_payload')<>1
 then raise exception 'Rejected payload denial audit was not separately durable';end if;
 if exists (
   select 1 from information_schema.columns
   where table_schema='apex_internal' and table_name='held_order_denial_events'
    and column_name ~* '(address|recipient|phone|email|raw|cipher|signature|secret|key)')
 then raise exception 'Confidential audit contains sensitive fields';end if;
 foreach v_name in array array[
  'apex_internal.order_detail_snapshots',
  'apex_internal.order_line_snapshots',
  'apex_internal.order_delivery_envelopes',
  'apex_internal.held_order_intake_accounting',
  'apex_internal.held_order_intake_audit',
  'apex_internal.held_order_source_permits',
  'apex_internal.held_order_worker_bindings',
  'apex_internal.held_order_denial_events'
 ] loop
  if has_table_privilege('apex_test_held_order_worker',v_name,'SELECT')
   or has_table_privilege('apex_test_held_order_worker',v_name,'INSERT')
   or has_table_privilege('apex_test_held_order_worker',v_name,'UPDATE')
   or has_table_privilege('apex_test_held_order_worker',v_name,'DELETE')
  then raise exception 'Worker retained direct table rights on %',v_name;end if;
 end loop;
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Worker activated commerce';end if;
end $postflight$;

-- Source revocation must stop a previously successful worker.
update apex_internal.held_order_worker_bindings
 set active=false,changed_at=clock_timestamp()
 where store_id='62000000-0000-0000-0000-000000000001';
select 'PASS: one sealed held order, one success event, confidential denial, no exposed privileges';
