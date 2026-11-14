-- Disposable PostgreSQL only. Requires the Node synthetic order lifecycle
-- and the proposed terminal-delivery purge migration. No hosted data.
do $assertions$
declare
 v_order uuid;
 v_blocked boolean:=false;
 v_rows integer;
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
   is distinct from false
 then raise exception 'Checkout gate must remain OFF'; end if;

 select id into v_order from apex_internal.retail_order_holds
 where request_id='ea1f01bf-85b0-4d78-8ed8-af3eb620eae1';
 if v_order is null or
    (select state from apex_internal.retail_order_holds where id=v_order)
      is distinct from 'expired_no_payment' or
    not exists(select 1 from apex_internal.retail_order_delivery_envelopes
      where order_id=v_order)
 then raise exception 'Synthetic expired encrypted delivery fixture missing';end if;

 -- A terminal record younger than one hour must still be immutable.
 begin
  delete from apex_internal.retail_order_delivery_envelopes
   where order_id=v_order;
 exception when sqlstate '42501' then
  v_blocked:=true;
 end;
 if not v_blocked or
    not exists(select 1 from apex_internal.retail_order_delivery_envelopes
     where order_id=v_order)
 then raise exception 'Young terminal delivery was not protected';end if;

 -- Aging the synthetic termination timestamp models the scheduled purge.
 update apex_internal.retail_order_holds
  set ended_at=now()-interval '2 hours'
  where id=v_order;
 v_rows:=apex_internal.purge_terminal_retail_delivery_v1(100);
 if v_rows<>1 or exists(select 1
    from apex_internal.retail_order_delivery_envelopes where order_id=v_order)
 then raise exception 'Eligible encrypted delivery was not purged';end if;
 if apex_internal.purge_terminal_retail_delivery_v1(100)<>0
 then raise exception 'Repeat purge changed records';end if;

 -- The two original purchased lines remain immutable even after
 -- transient encrypted delivery is removed. Both stock holds stay released.
 if (select count(*) from apex_internal.retail_order_hold_lines
     where order_id=v_order)<>2 or
    (select state from apex_internal.retail_order_holds where id=v_order)
      <> 'expired_no_payment' or
    (select quantity_reserved from public.inventory_items
      where product_id='50000000-0000-4000-8000-000000000001')<>0 or
    (select quantity_reserved from public.inventory_items
      where product_id='50000000-0000-4000-8000-000000000005')<>0
 then raise exception 'Immutable two-line order or stock audit changed';end if;

 if (select count(*) from cron.job
   where jobname='apex-retail-delivery-purge-v1' and active
    and schedule='*/5 * * * *')<>1 or
    has_function_privilege('anon',
     'apex_internal.purge_terminal_retail_delivery_v1(integer)','EXECUTE') or
    has_function_privilege('authenticated',
     'apex_internal.purge_terminal_retail_delivery_v1(integer)','EXECUTE') or
    has_function_privilege('service_role',
     'apex_internal.purge_terminal_retail_delivery_v1(integer)','EXECUTE') or
    has_table_privilege('apex_retail_checkout_executor',
      'apex_internal.retail_order_delivery_envelopes','DELETE') or
    (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
      is distinct from false
 then raise exception 'Purge scheduling or private permissions are unsafe';end if;
end $assertions$;
