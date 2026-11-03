-- PR #189: production-compatible read-only cart validation in disposable CI DB.
\set ON_ERROR_STOP on
do $$
begin
 if has_function_privilege('anon',
    'public.get_admin_private_cart_validation(uuid,jsonb)','EXECUTE')
  or has_table_privilege('authenticated',
    'apex_internal.checkout_order_intents','INSERT')
 then raise exception 'Cart validation permissions unsafe';end if;
end $$;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_private_cart_validation(
    '62000000-0000-0000-0000-000000000001',
    '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous price/stock read permitted';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_private_cart_validation(
   '62000000-0000-0000-0000-000000000001',
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier spoofed admin validation';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare
 store uuid:='62000000-0000-0000-0000-000000000001';
 product uuid:='64000000-0000-0000-0000-000000000001';
 items jsonb:='[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":2}]';
 result jsonb;
 entry jsonb;
 denied boolean;
 bad jsonb;
begin
 result:=public.get_admin_private_cart_validation(store,items);
 entry:=result->'items'->0;
 if result->>'state'<>'private_cart_observation'
   or result->>'observed_subtotal_cents'<>'10000'
   or result->>'total_units'<>'2'
   or result->>'can_quote'<>'false'
   or result->>'can_reserve_stock'<>'false'
   or result->>'can_create_order'<>'false'
   or result->>'can_create_invoice'<>'false'
   or result->>'can_pay'<>'false'
   or entry->>'unit_price_cents'<>'5000'
   or entry->>'line_subtotal_cents'<>'10000'
   or entry->>'quantity_available'<>'false'
   or entry->>'available_units'<>'0'
   or entry->>'release_status_code'='public_visible'
   or entry->>'can_order'<>'false'
   or entry->>'can_pay'<>'false'
   or entry ? 'internal_source_cost_cents'
   or entry ? 'supplier_wallet'
 then raise exception 'Private cart observation returned incorrect or unsafe values';end if;

 for bad in select value from jsonb_array_elements(
  jsonb_build_array(
   '[]'::jsonb,
   '{"product_id":"64000000-0000-0000-0000-000000000001","quantity":0}'::jsonb,
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":0}]'::jsonb,
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1,"unit_price_cents":1}]'::jsonb,
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":11}]'::jsonb,
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":"1"}]'::jsonb,
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1},{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb
  )
 )loop
  denied:=false;
  begin
   perform public.get_admin_private_cart_validation(store,bad);
  exception when invalid_parameter_value then denied:=true;end;
  if not denied then raise exception 'Untrusted cart input accepted: %',bad;end if;
 end loop;
 denied:=false;
 begin
  perform public.get_admin_private_cart_validation(
   '00000000-0000-0000-0000-000000000002',items);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store cart validation allowed';end if;
 denied:=false;
 begin
  perform public.get_admin_private_cart_validation(store,
   '[{"product_id":"00000000-0000-0000-0000-000000000003","quantity":1}]'::jsonb);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unknown product price data leaked';end if;
end $$;
rollback;

-- Source of truth changes must affect a *new* read immediately.
begin;
update public.inventory_items set quantity_on_hand=3,quantity_reserved=1
 where store_id='62000000-0000-0000-0000-000000000001'
   and product_id='64000000-0000-0000-0000-000000000001';
update public.products set price_cents=7500
 where store_id='62000000-0000-0000-0000-000000000001'
  and id='64000000-0000-0000-0000-000000000001';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare result jsonb;
begin
 result:=public.get_admin_private_cart_validation(
 '62000000-0000-0000-0000-000000000001',
 '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb);
 if result->>'observed_subtotal_cents'<>'15000'
  or result#>>'{items,0,unit_price_cents}'<>'7500'
  or result#>>'{items,0,available_units}'<>'2'
  or result#>>'{items,0,quantity_available}'<>'true'
  or result#>>'{items,0,can_order}'<>'false'
 then raise exception 'Live price/stock readback not reflected';end if;
end $$;
rollback;

do $$
begin
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Cart validation created a transactional record';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 then raise exception 'Cart validation activated release';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Cart validation published merchandise';end if;
end $$;
select 'PASS: server database price/stock, multi-item validation denied, no real checkout';
