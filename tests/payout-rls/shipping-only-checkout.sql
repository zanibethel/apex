-- PR #196: checkout data excludes tax entirely; private shipping controls stay.
\set ON_ERROR_STOP on
do $pre$
begin
 if has_function_privilege('authenticated',
  'public.set_bulk_product_tax_collection(uuid,uuid[],boolean)','EXECUTE')
  or has_function_privilege('authenticated',
   'public.get_admin_private_checkout_rules_overview(uuid)','EXECUTE')
  or not has_function_privilege('authenticated',
   'public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
  or has_function_privilege('anon',
   'public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)','EXECUTE')
 then raise exception 'Legacy tax RPC or shipping privilege incorrect';end if;
end $pre$;
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $supplier$
declare denied boolean:=false;
begin
 begin
 perform public.set_bulk_product_tax_collection(
  '62000000-0000-0000-0000-000000000001',
  array['64000000-0000-0000-0000-000000000001']::uuid[],false);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Retired product tax RPC callable';end if;
 denied:=false;
 begin
 perform public.get_admin_private_checkout_charge_source(
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',2,'');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier received admin checkout pricing';end if;
end $supplier$;
rollback;
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $admin$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 p uuid:='64000000-0000-0000-0000-000000000001';
 r jsonb;
 denied boolean:=false;
begin
 r:=public.get_admin_private_checkout_charge_source(s,p,2,'FREESHIP');
 if r->>'schema_version'<>'2'
  or r->>'state'<>'private_shipping_charge_source'
  or r->>'observed_subtotal_cents'<>'10000'
  or r#>>'{promotion,discount_kind}'<>'free_shipping'
  or r->>'can_create_order'<>'false'
  or r->>'can_create_invoice'<>'false'
  or r->>'can_reserve_stock'<>'false'
  or r->>'can_pay'<>'false'
  or r->>'checkout_enabled'<>'false'
  or r ? 'tax_source' or r ? 'tax_cents'
  or r ? 'collect_sales_tax' or r ? 'tax_collection'
 then raise exception 'Private shipping source included tax or checkout rights';end if;
 begin
 perform public.get_admin_private_checkout_rules_overview(s);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Legacy product tax overview still callable';end if;
end $admin$;
rollback;
do $post$
begin
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Shipping-only migration changed release or payments';end if;
end $post$;
select 'PASS: no checkout taxes, admin shipping source, legacy tax RPC denied';
