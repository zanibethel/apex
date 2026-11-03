-- PR #190: locked admin recheck never constitutes order admission.
\set ON_ERROR_STOP on
do $$
begin
 if has_function_privilege('anon',
   'public.get_admin_locked_cart_preflight(uuid,jsonb,bigint)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.checkout_order_intents','INSERT')
 then raise exception 'Locked preflight leaked privileges';end if;
end $$;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_locked_cart_preflight(
  '62000000-0000-0000-0000-000000000001',
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
  5000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous locked inspection allowed';end if;
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
  perform public.get_admin_locked_cart_preflight(
  '62000000-0000-0000-0000-000000000001',
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
  5000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier forged admin role';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare
 store uuid:='62000000-0000-0000-0000-000000000001';
 items jsonb:='[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":2}]';
 r jsonb;
 denied boolean;
begin
 r:=public.get_admin_locked_cart_preflight(store,items,10000);
 if r->>'schema_version'<>'2'
   or r->>'state'<>'locked_private_preflight'
   or r->>'observed_subtotal_cents'<>'10000'
   or r->>'subtotal_matches_display'<>'true'
   or r->>'expected_subtotal_cents'<>'10000'
   or r->>'lock_mode'<>'for_share_nowait'
   or r->>'locks_persist_after_response'<>'false'
   or r->>'admission'<>'blocked'
   or r->>'can_create_order'<>'false'
   or r->>'can_create_invoice'<>'false'
   or r->>'can_reserve_stock'<>'false'
   or r->>'can_quote'<>'false'
   or r->>'can_pay'<>'false'
   or r#>>'{items,0,quantity_available}'<>'false'
 then raise exception 'Unexpected admission or source price result';end if;
 r:=public.get_admin_locked_cart_preflight(store,items,9000);
 if r->>'subtotal_matches_display'<>'false'
   or r->>'observed_subtotal_cents'<>'10000'
 then raise exception 'Changed browser total was trusted';end if;
 denied:=false;
 begin
  perform public.get_admin_locked_cart_preflight(store,items,-1);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Negative expected subtotal accepted';end if;
 denied:=false;
 begin
  perform public.get_admin_locked_cart_preflight(
  '00000000-0000-0000-0000-000000000002',items,10000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store preflight allowed';end if;
end $$;
rollback;

-- Changing the database price must immediately invalidate displayed totals.
begin;
update public.products set price_cents=8500
 where id='64000000-0000-0000-0000-000000000001';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare r jsonb;
begin
 r:=public.get_admin_locked_cart_preflight(
 '62000000-0000-0000-0000-000000000001',
 '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb,
 10000);
 if r->>'observed_subtotal_cents'<>'17000'
  or r->>'subtotal_matches_display'<>'false'
 then raise exception 'Stale shown price not invalidated';end if;
end $$;
rollback;

do $$
begin
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Private preflight wrote an order or provider intent';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Private preflight opened public catalog';end if;
end $$;
select 'PASS: locked private preflight verifies price change, flags and no purchase';
