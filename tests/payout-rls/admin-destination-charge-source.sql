-- PR #194: live-price private destination charge snapshot is admin-only and
-- cannot authorize final tax, invoices or public catalog release.
\set ON_ERROR_STOP on
do $preflight$
begin
 if has_function_privilege('anon',
   'public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)',
   'EXECUTE')
  or has_table_privilege('authenticated',
    'apex_internal.checkout_order_intents','INSERT')
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Destination quote permissions unsafe';end if;
end $preflight$;

begin;
set local role anon;
do $anon$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_private_checkout_charge_source(
   '62000000-0000-0000-0000-000000000001',
   '64000000-0000-0000-0000-000000000001',1,'');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous private price quote accepted';end if;
end $anon$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $supplier$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_private_checkout_charge_source(
   '62000000-0000-0000-0000-000000000001',
   '64000000-0000-0000-0000-000000000001',1,'FREESHIP');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Forged supplier admin could quote private prices';end if;
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
 r jsonb; denied boolean;
begin
 r:=public.get_admin_private_checkout_charge_source(s,p,2,'');
 if r->>'schema_version'<>'1'
  or r->>'state'<>'private_destination_charge_source'
  or r->>'unit_price_cents'<>'5000'
  or r->>'observed_subtotal_cents'<>'10000'
  or r->>'quantity'<>'2'
  or r->>'currency'<>'USD'
  or r->>'collect_sales_tax'<>'true'
  or r->>'requested_code'<>''
  or r->>'promotion_found'<>'false'
  or r->'promotion'<>'null'::jsonb
  or r->>'tax_source'<>'not_configured'
  or r->'tax_cents'<>'null'::jsonb
  or r->'total_cents'<>'null'::jsonb
  or r->>'can_quote_final_total'<>'false'
  or r->>'can_create_order'<>'false'
  or r->>'can_create_invoice'<>'false'
  or r->>'can_reserve_stock'<>'false'
  or r->>'can_pay'<>'false'
  or r->>'checkout_enabled'<>'false'
 then raise exception 'Incorrect private quote source or unexpected payment capability';end if;
 r:=public.get_admin_private_checkout_charge_source(s,p,1,'FREESHIP');
 if r->>'promotion_found'<>'true'
  or r#>>'{promotion,code}'<>'FREESHIP'
  or r#>>'{promotion,discount_kind}'<>'free_shipping'
  or r#>>'{promotion,min_subtotal_cents}'<>'5000'
 then raise exception 'Saved free-shipping code not retrieved accurately';end if;
 r:=public.get_admin_private_checkout_charge_source(s,p,1,'NOTFOUND');
 if r->>'promotion_found'<>'false' or r->'promotion'<>'null'::jsonb
 then raise exception 'Missing code silently reused another promotion';end if;
 denied:=false;
 begin
  perform public.get_admin_private_checkout_charge_source(
   '62000000-0000-0000-0000-000000000002',p,1,'');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store quote accepted';end if;
 denied:=false;
 begin
  perform public.get_admin_private_checkout_charge_source(s,p,0,'');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Zero quantity accepted';end if;
 denied:=false;
 begin
  perform public.get_admin_private_checkout_charge_source(s,p,1,'freeshow');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Invalid lowercase discount code accepted';end if;
end $admin$;
rollback;

-- Price and per-product tax setting are read fresh from stored data.
begin;
update public.products set price_cents=7300,collect_sales_tax=false
 where id='64000000-0000-0000-0000-000000000001';
insert into public.apex_store_shipping_settings(store_id,charge_shipping,
 flat_shipping_cents,free_shipping_min_subtotal_cents,updated_by)
values('62000000-0000-0000-0000-000000000001',true,
 795,15000,'00000000-0000-0000-0000-000000000001');
update public.supplier_discount_codes set is_active=true
 where store_id='62000000-0000-0000-0000-000000000001' and code='FREESHIP';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $changed$
declare r jsonb;
begin
 r:=public.get_admin_private_checkout_charge_source(
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',2,'FREESHIP');
 if r->>'observed_subtotal_cents'<>'14600'
  or r->>'collect_sales_tax'<>'false'
  or r#>>'{shipping,charge_shipping}'<>'true'
  or r#>>'{shipping,flat_shipping_cents}'<>'795'
  or r#>>'{shipping,free_shipping_min_subtotal_cents}'<>'15000'
  or r#>>'{promotion,is_active}'<>'true'
 then raise exception 'Saved changed price/tax/shipping/promo was not observed';end if;
end $changed$;
rollback;

do $post$
begin
 if (select price_cents from public.products
  where id='64000000-0000-0000-0000-000000000001')<>5000
  or (select count(*) from apex_internal.checkout_order_intents)<>0
  or (select count(*) from apex_internal.btcpay_invoice_post_intents)<>0
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Private quote persisted a price change or payment intent';end if;
end $post$;
select 'PASS: saved source prices, codes, shipping, tax flags, admin-only, no final quote or orders';
