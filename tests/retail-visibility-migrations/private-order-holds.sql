-- Disposable Postgres integration tests for the private, disabled-by-default
-- retail order engine. NEVER APPLY THIS FIXTURE TO PRODUCTION.
do $$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
    is distinct from false
 then raise exception 'Order engine was enabled by migration';end if;
 if has_table_privilege('anon','apex_internal.retail_order_holds','SELECT') or
  has_table_privilege('authenticated','apex_internal.retail_order_hold_lines','SELECT') or
  has_table_privilege('service_role','apex_internal.retail_order_holds','INSERT') or
  has_function_privilege('anon',
   'apex_internal.reserve_retail_order_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  has_function_privilege('authenticated',
   'apex_internal.end_retail_order_hold(uuid,text,text)','EXECUTE') or
  has_function_privilege('service_role',
   'apex_internal.reserve_retail_order_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE')
 then raise exception 'Private order engine has leaked application privileges';end if;
 if exists(select 1 from information_schema.columns
   where table_schema='apex_internal' and table_name in
    ('retail_order_holds','retail_order_hold_lines')
    and column_name in ('email','address','address1','phone','wallet_address'))
 then raise exception 'Customer PII unexpectedly stored in order engine';end if;
end $$;

-- Production gate prevents all writes even when the catalog display gate is ON.
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
    '10000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',repeat('a',64),
    '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
    '','auto',4499);
  raise exception 'Expected separate OFF order gate';
 exception when others then
  if SQLERRM='Expected separate OFF order gate' then raise;end if;
  if SQLERRM not like '%engine remains disabled%' then raise;end if;
 end;
end $$;
select count(*)=0 as no_orders_before_fixture_enable
 from apex_internal.retail_order_holds;

-- Restoring a 5-unit shirt, 2-unit serum and the provider-free fixture price.
update public.inventory_items set quantity_on_hand=5,quantity_reserved=0
where store_id='10000000-0000-4000-8000-000000000001'
 and product_id='50000000-0000-4000-8000-000000000001';
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
values('10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',2,0);
-- ONLY the disposable fixture enables this private gate.
update apex_internal.retail_order_engine_gate
 set enabled=true where singleton=true;

-- Two-product quote: shirt 2999 + serum 3999 = 6998; TEST10 discounts
-- 700 cents; $15 flat shipping applies => total 7798.
do $$
declare
 v jsonb;v_again jsonb;v_id uuid;
 v_items jsonb:='[{"product_id":"50000000-0000-4000-8000-000000000005","quantity":1},
  {"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]';
begin
 v:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',repeat('a',64),
  v_items,'TEST10','auto',7798);
 if v->>'status'<>'held_no_payment' or v->>'replayed'<>'false' or
    v->>'total_cents'<>'7798' or v->>'can_pay'<>'false' or
    v->>'invoice_created'<>'false' or v->>'can_ship'<>'false'
 then raise exception 'Expected a nonpayable held order: %',v;end if;
 v_id:=(v->>'order_id')::uuid;
 if not exists(select 1 from apex_internal.retail_order_holds o
  where o.id=v_id and o.merchandise_cents=6998 and
    o.merchandise_discount_cents=700 and o.shipping_cents=1500 and
    o.total_cents=7798 and o.line_count=2 and o.unit_count=2 and
    o.shipping_box='small' and o.state='held_no_payment')
 then raise exception 'Wrong immutable order snapshot';end if;
 if not exists(select 1 from apex_internal.retail_order_hold_lines l
  where l.order_id=v_id and l.sku_snapshot='SERUM-001' and
   l.name_snapshot='Copper Peptide Hair Serum' and
   l.unit_price_cents=3999 and l.quantity=1 and l.line_subtotal_cents=3999)
 then raise exception 'Wrong serum price snapshot';end if;
 if not exists(select 1 from public.inventory_items i
  where i.product_id='50000000-0000-4000-8000-000000000001'
  and i.quantity_reserved=1)
 then raise exception 'Shirt was not reserved';end if;
 if not exists(select 1 from public.inventory_items i
  where i.product_id='50000000-0000-4000-8000-000000000005'
  and i.quantity_reserved=1)
 then raise exception 'Serum was not reserved';end if;
 v_again:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',repeat('a',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
    {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
  'TEST10','auto',7798);
 if v_again->>'order_id'<>v->>'order_id' or v_again->>'replayed'<>'true' or
   (select count(*) from apex_internal.retail_order_holds)<>1 or
   (select count(*) from apex_internal.retail_order_hold_events)<>1
 then raise exception 'Duplicate-key replay made another order: %',v_again;end if;
end $$;

-- Same idempotency request ID with a modified cart or request binding must fail.
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000001',repeat('b',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
     {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
   'TEST10','auto',7798);
  raise exception 'Expected idempotency mismatch denial';
 exception when others then
  if SQLERRM='Expected idempotency mismatch denial' then raise;end if;
  if SQLERRM not like '%Idempotency request changed%' then raise;end if;
 end;
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000001',repeat('a',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":2},
     {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
   'TEST10','auto',7798);
  raise exception 'Expected cart-payload mismatch denial';
 exception when others then
  if SQLERRM='Expected cart-payload mismatch denial' then raise;end if;
 end;
end $$;

-- A second order cannot reserve the last two serum units while the first hold
-- is active. Failure rolls back every stock and order write.
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000002',repeat('c',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
     {"product_id":"50000000-0000-4000-8000-000000000005","quantity":2}]',
   'TEST10','auto',11397);
  raise exception 'Expected insufficient stock denial';
 exception when others then
  if SQLERRM='Expected insufficient stock denial' then raise;end if;
  if SQLERRM not like '%Insufficient verified stock%' then raise;end if;
 end;
 if (select count(*) from apex_internal.retail_order_holds)<>1
    or (select quantity_reserved from public.inventory_items where
      product_id='50000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Failed order left partial reservations';end if;
end $$;

-- No hidden category/product keyword exclusion: no product name is used as a
-- classifier, while explicit administrator holds remain operative.
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"platform_admin"}}',false);
select public.set_admin_retail_product_restriction(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',true,'Pending review');
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000003',repeat('d',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
   '','auto',5499);
  raise exception 'Expected administrator hold denial';
 exception when others then
  if SQLERRM='Expected administrator hold denial' then raise;end if;
  if SQLERRM not like '%Product publishing or administrator hold%' then raise;end if;
 end;
end $$;
select public.set_admin_retail_product_restriction(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005',false,'Completed review');

-- Supplier-2 merchandise cannot be added to supplier-1 held order.
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000004',repeat('e',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000004","quantity":1}]',
   '','auto',1500);
  raise exception 'Expected cross-store denial';
 exception when others then
  if SQLERRM='Expected cross-store denial' then raise;end if;
  if SQLERRM not like '%Product unavailable for retail order%' then raise;end if;
 end;
end $$;

-- Verify cancellation releases stock once and cannot permit re-reservation on
-- the same request key, even if the product's price subsequently changes.
do $$
declare v_id uuid;v_result jsonb;v_same jsonb;
begin
 select id into v_id from apex_internal.retail_order_holds where
  request_id='80000000-0000-4000-8000-000000000001';
 v_result:=apex_internal.end_retail_order_hold(v_id,'cancel','Customer abandoned');
 v_same:=apex_internal.end_retail_order_hold(v_id,'cancel','Retry cancel');
 if v_result->>'status'<>'cancelled_no_payment' or
  v_same->>'replayed'<>'true' or
  (select count(*) from apex_internal.retail_order_hold_events
    where order_id=v_id and event_type='hold_cancelled')<>1 or
  (select count(*) from public.inventory_items i
    where i.store_id='10000000-0000-4000-8000-000000000001'
     and i.product_id in (
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000005') and i.quantity_reserved=0)<>2
 then raise exception 'Cancellation did not release exactly once';end if;
 v_same:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',repeat('a',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
    {"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
  'TEST10','auto',7798);
 if v_same->>'status'<>'cancelled_no_payment' or v_same->>'replayed'<>'true'
 then raise exception 'Terminal request key reopened a hold';end if;
end $$;

-- Prices must recheck under a product lock before inventory is changed.
update public.products set price_cents=3200 where
 id='50000000-0000-4000-8000-000000000001';
do $$
begin
 begin
  perform apex_internal.reserve_retail_order_hold(
   '10000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000005',repeat('f',64),
   '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
   '','auto',4499);
  raise exception 'Expected stale price denial';
 exception when others then
  if SQLERRM='Expected stale price denial' then raise;end if;
  if SQLERRM not like '%Stale cart total%' then raise;end if;
 end;
end $$;

-- A 5-unit quote chooses the medium packaging, not the envelope.
do $$
declare v jsonb;
begin
 v:=apex_internal.reserve_retail_order_hold(
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000006',repeat('1',64),
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":5}]',
  '','auto',18580);
 if v->>'status'<>'held_no_payment' or
  (select shipping_box from apex_internal.retail_order_holds where
   request_id='80000000-0000-4000-8000-000000000006')<>'medium'
 then raise exception 'Medium capacity pricing failed';end if;
end $$;
-- Early expiry is prohibited, even though cancellation is permitted.
do $$
declare v_id uuid;
begin
 select id into v_id from apex_internal.retail_order_holds where
  request_id='80000000-0000-4000-8000-000000000006';
 begin
  perform apex_internal.end_retail_order_hold(v_id,'expire','Too early');
  raise exception 'Expected early expiry denial';
 exception when others then
  if SQLERRM='Expected early expiry denial' then raise;end if;
  if SQLERRM not like '%has not expired%' then raise;end if;
 end;
 update apex_internal.retail_order_holds set
  created_at=now()-interval '1 hour',
  expires_at=now()-interval '1 minute' where id=v_id;
end $$;
do $$
begin
 if apex_internal.expire_due_retail_order_holds(10)<>1 or
    apex_internal.expire_due_retail_order_holds(10)<>0
 then raise exception 'Expired batch was not idempotent';end if;
 if (select count(*) from apex_internal.retail_order_hold_events where
  event_type='hold_expired')<>1
 then raise exception 'Expected exactly one expiry event';end if;
 if (select count(*) from public.inventory_items i where
  i.product_id='50000000-0000-4000-8000-000000000001' and
  i.quantity_reserved=0)<>1
 then raise exception 'Expired stock not restored';end if;
end $$;

-- A product snapshot cannot be rewritten after the order is recorded.
do $$
begin
 begin
  update apex_internal.retail_order_hold_lines set unit_price_cents=1
   where order_id=(select id from apex_internal.retail_order_holds
     where request_id='80000000-0000-4000-8000-000000000001');
  raise exception 'Expected immutable line denial';
 exception when others then
  if SQLERRM='Expected immutable line denial' then raise;end if;
  if SQLERRM not like '%snapshots are immutable%' then raise;end if;
 end;
end $$;

-- Disable fixture-only order writes again.
update apex_internal.retail_order_engine_gate set enabled=false where singleton=true;
do $$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
    is distinct from false
 then raise exception 'Final private order gate not OFF';end if;
end $$;
