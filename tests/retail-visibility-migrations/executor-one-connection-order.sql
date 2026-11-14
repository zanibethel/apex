-- Disposable PostgreSQL only. First verified private execution-role run.
-- This is a real BEGIN/COMMIT with a single psql connection; bytes are
-- synthetic encryption-shaped fixtures, never any real customer PII.
do $$
begin
 if (select rolcanlogin from pg_roles where rolname='apex_retail_checkout_executor')
  is distinct from false or
  (select rolsuper or rolbypassrls from pg_roles
    where rolname='apex_retail_checkout_executor') is distinct from false or
  has_table_privilege('apex_retail_checkout_executor','public.inventory_items','SELECT') or
  has_table_privilege('apex_retail_checkout_executor','public.products','SELECT') or
  has_table_privilege('apex_retail_checkout_executor','apex_internal.retail_order_holds','SELECT') or
  not has_function_privilege('apex_retail_checkout_executor',
    'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  not has_function_privilege('apex_retail_checkout_executor',
    'apex_internal.checkout_worker_attach_retail_delivery(uuid,uuid,text,bytea,bytea,bytea)','EXECUTE') or
  not has_function_privilege('apex_retail_checkout_executor',
    'apex_internal.checkout_worker_get_retail_receipt(uuid,uuid)','EXECUTE') or
  has_function_privilege('anon',
    'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  has_function_privilege('service_role',
    'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE')
 then raise exception 'Incorrect private worker role grants';end if;
end $$;

-- OFF by default, even with execution role. No writes occur.
set role apex_retail_checkout_executor;
do $$
begin
 begin
  perform apex_internal.checkout_worker_reserve_retail_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000901',repeat('a',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
  '','auto',4700);
  raise exception 'Expected order gate denied';
 exception when others then
  if SQLERRM='Expected order gate denied' then raise;end if;
  if SQLERRM not like '%engine remains disabled%' then raise;end if;
 end;
end $$;
reset role;

-- Fixture enabling, never production.
update public.inventory_items set quantity_on_hand=3,quantity_reserved=0
where product_id='50000000-0000-4000-8000-000000000001';
update apex_internal.retail_order_engine_gate set enabled=true where singleton=true;

begin;
set local role apex_retail_checkout_executor;
-- The worker can obtain only the public sanitized, nonpayable quote.
select (public.get_public_retail_cart_quote_source(
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]','')
 ->>'state')='rechecked_inventory_cart' as retail_quote_valid \gset
\if :retail_quote_valid
\else
 \echo 'FAIL: worker cannot read the sanitized quote'
 \quit 1
\endif

-- This writer is an actual PostgreSQL transaction. The immutable order,
-- stock hold and encrypted delivery must be committed together.
select (apex_internal.checkout_worker_reserve_retail_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000901',repeat('a',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
 '','auto',4700)->>'order_id') as synthetic_order_id \gset

select (apex_internal.checkout_worker_attach_retail_delivery(
 '10000000-0000-4000-8000-000000000001',
 :'synthetic_order_id'::uuid,'test_key_1',
 decode(repeat('01',12),'hex'),decode(repeat('ab',32),'hex'),
 decode(repeat('cd',16),'hex'))->>'sealed') as synthetic_sealed \gset
\if :synthetic_sealed
\else
 \echo 'FAIL: private encrypted delivery was not sealed'
 \quit 1
\endif

select (apex_internal.checkout_worker_get_retail_receipt(
 '10000000-0000-4000-8000-000000000001',
 :'synthetic_order_id'::uuid)->>'total_cents')='4700' as synthetic_total_verified \gset
\if :synthetic_total_verified
\else
 \echo 'FAIL: missing private checkout receipt'
 \quit 1
\endif
commit;

-- Exactly one order/line/envelope and one unit held, nothing payable.
do $$
declare v_order uuid;
begin
 select id into v_order from apex_internal.retail_order_holds
 where request_id='80000000-0000-4000-8000-000000000901';
 if v_order is null or
   (select count(*) from apex_internal.retail_order_hold_lines where order_id=v_order)<>1 or
   (select count(*) from apex_internal.retail_order_delivery_envelopes where order_id=v_order)<>1 or
   (select quantity_reserved from public.inventory_items where
    product_id='50000000-0000-4000-8000-000000000001')<>1 or
   (select state from apex_internal.retail_order_holds where id=v_order)<>'held_no_payment' or
   (select merchandise_cents+shipping_cents-merchandise_discount_cents from
    apex_internal.retail_order_holds where id=v_order)<>4700
 then raise exception 'Single-connection worker transaction was not atomic';end if;
end $$;

-- A retry from exactly the same private identity must reuse the order.
begin;
set local role apex_retail_checkout_executor;
select (apex_internal.checkout_worker_reserve_retail_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000901',repeat('a',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
 '','auto',4700)->>'replayed') as synthetic_replayed \gset
commit;
\if :synthetic_replayed
\else
 \echo 'FAIL: request replay tried reserving stock twice'
 \quit 1
\endif

do $$
begin
 if (select count(*) from apex_internal.retail_order_holds
  where request_id='80000000-0000-4000-8000-000000000901')<>1 or
  (select quantity_reserved from public.inventory_items where
   product_id='50000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Replay reserved an extra product or order';end if;
end $$;

-- Force expiry, running the SAME production private cleanup function.
update apex_internal.retail_order_holds set
 created_at=now()-interval '1 hour',
 expires_at=now()-interval '1 minute'
where request_id='80000000-0000-4000-8000-000000000901';
do $$
begin
 if apex_internal.expire_due_retail_order_holds(20)<>1 or
    apex_internal.expire_due_retail_order_holds(20)<>0 or
    (select quantity_reserved from public.inventory_items where
     product_id='50000000-0000-4000-8000-000000000001')<>0 or
    (select state from apex_internal.retail_order_holds
     where request_id='80000000-0000-4000-8000-000000000901')<>'expired_no_payment'
 then raise exception 'Expired held order failed to restore stock exactly once';end if;
end $$;
update apex_internal.retail_order_engine_gate set enabled=false where singleton=true;
do $$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
 is distinct from false or
 exists(select 1 from apex_internal.retail_order_holds where state='held_no_payment')
 then raise exception 'Fixture left commerce admission open';end if;
end $$;
