-- PR #193: authenticated private checkout policy settings, no payments.
\set ON_ERROR_STOP on
do $guard$
begin
 if has_function_privilege('anon','public.set_bulk_product_tax_collection(uuid,uuid[],boolean)','EXECUTE')
  or has_function_privilege('anon','public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
  or has_function_privilege('anon','public.get_admin_private_checkout_rules_overview(uuid)','EXECUTE')
  or has_table_privilege('authenticated','public.apex_store_shipping_settings','UPDATE')
  or has_table_privilege('authenticated','public.apex_product_tax_setting_events','INSERT')
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Unsafe checkout settings privileges';end if;
 if (select collect_sales_tax from public.products where
   id='64000000-0000-0000-0000-000000000001') is distinct from true
 then raise exception 'Existing products must default to collect sales tax';end if;
end $guard$;

begin;
set local role anon;
do $anon$
declare denied boolean:=false;
begin
 begin
 perform public.set_bulk_product_tax_collection(
  '62000000-0000-0000-0000-000000000001',
  array['64000000-0000-0000-0000-000000000001']::uuid[],false);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous tax update allowed';end if;
 denied:=false;
 begin
 perform public.get_admin_private_checkout_rules_overview(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous tax overview readable';end if;
end $anon$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000003';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $supplier$
declare denied boolean:=false;
begin
 begin
 perform public.set_bulk_product_tax_collection(
  '62000000-0000-0000-0000-000000000001',
  array['64000000-0000-0000-0000-000000000001']::uuid[],false);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned supplier forged tax update';end if;
 denied:=false;
 begin
 perform public.save_private_store_shipping_settings(
  '62000000-0000-0000-0000-000000000001',true,795,10000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned supplier edited shipping';end if;
 denied:=false;
 begin
 perform public.get_admin_private_checkout_rules_overview(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier read admin-only overview';end if;
end $supplier$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $owner$
declare
 v_store uuid:='62000000-0000-0000-0000-000000000001';
 v_product uuid:='64000000-0000-0000-0000-000000000001';
 r jsonb;
 denied boolean;
begin
 r:=public.set_bulk_product_tax_collection(v_store,array[v_product],false);
 if r->>'changed'<>'1' or r->>'selected'<>'1' or
   r->>'checkout_enabled'<>'false' or
   (select collect_sales_tax from public.products where id=v_product)
    is distinct from false
 then raise exception 'Uncheck collect sales tax did not save';end if;
 r:=public.set_bulk_product_tax_collection(v_store,array[v_product],false);
 if r->>'changed'<>'0' or (select count(*) from
   public.apex_product_tax_setting_events where product_id=v_product)<>1
 then raise exception 'No-op tax update created a duplicate event';end if;
 denied:=false;
 begin
 perform public.set_bulk_product_tax_collection(v_store,
  array[v_product,v_product],true);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Duplicate bulk product IDs accepted';end if;
 denied:=false;
 begin
 perform public.set_bulk_product_tax_collection(v_store,
  array['00000000-0000-0000-0000-000000000099'::uuid],false);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign product changed through bulk tax';end if;
 r:=public.set_bulk_product_tax_collection(v_store,array[v_product],true);
 if r->>'changed'<>'1' or
   (select collect_sales_tax from public.products where id=v_product)
     is distinct from true
 then raise exception 'Rechecked tax collection did not save';end if;

 r:=public.save_private_store_shipping_settings(v_store,true,795,10000);
 if r->>'charge_shipping'<>'true' or
   r->>'flat_shipping_cents'<>'795' or
   r->>'free_shipping_min_subtotal_cents'<>'10000' or
   r->>'checkout_enabled'<>'false'
 then raise exception 'Shipping fee/threshold not recorded';end if;
 r:=public.save_private_store_shipping_settings(v_store,true,795,10000);
 if (select count(*) from public.apex_shipping_setting_events
  where store_id=v_store)<>1
 then raise exception 'Identical shipping settings emitted extra audit';end if;
 r:=public.save_private_store_shipping_settings(v_store,false,0,null);
 if r->>'charge_shipping'<>'false' or
    r->>'flat_shipping_cents'<>'0' or
    r->>'free_shipping_min_subtotal_cents'<>'null'
 then raise exception 'Optional zero-shipping policy failed';end if;
 denied:=false;
 begin
 perform public.save_private_store_shipping_settings(v_store,false,100,null);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Shipping disabled but fee not zero';end if;
 denied:=false;
 begin
 perform public.save_private_store_shipping_settings(v_store,true,795,0);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Zero free-shipping threshold permitted';end if;
end $owner$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $admin$
declare
 r jsonb;
 s uuid:='62000000-0000-0000-0000-000000000001';
 p uuid:='64000000-0000-0000-0000-000000000001';
begin
 r:=public.get_admin_private_checkout_rules_overview(s);
 if r->>'store_id'<>s::text or r->>'checkout_enabled'<>'false'
  or jsonb_array_length(r->'products')<1 or
  (r->'shipping'->>'charge_shipping')<>'false'
  or (r->'shipping'->>'flat_shipping_cents')<>'0'
 then raise exception 'Admin private overview failed';end if;
 r:=public.set_bulk_product_tax_collection(s,array[p],false);
 if r->>'changed'<>'1' then raise exception 'Verified admin tax update failed';end if;
 r:=public.save_private_store_shipping_settings(s,true,500,null);
 if r->>'flat_shipping_cents'<>'500'
 then raise exception 'Verified admin shipping update failed';end if;
end $admin$;
rollback;

-- Free shipping is a CODE BENEFIT, not a merch price discount.
insert into public.supplier_discount_codes(store_id,code,discount_kind,
 discount_value,min_subtotal_cents,created_by)
values('62000000-0000-0000-0000-000000000001','FREESHIP',
 'free_shipping',1,5000,'00000000-0000-0000-0000-000000000001');
do $promo$
declare bad boolean:=false;
begin
 begin
 insert into public.supplier_discount_codes(store_id,code,discount_kind,
  discount_value,min_subtotal_cents,created_by)
 values('62000000-0000-0000-0000-000000000001','INVALIDFREESHIP',
  'free_shipping',99,0,'00000000-0000-0000-0000-000000000001');
 exception when check_violation then bad:=true;end;
 if not bad then raise exception 'Free shipping accepted a merchandise amount';end if;
 if (select discount_kind from public.supplier_discount_codes
  where code='FREESHIP')<>'free_shipping'
 then raise exception 'Free shipping code not persisted';end if;
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
  or exists(select 1 from public.products where is_published)
 then raise exception 'Checkout rules activated orders or public listing';end if;
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Checkout rules changed private release gate';end if;
end $promo$;
select 'PASS: private product tax flags, bulk permissions, shipping rules, free shipping promo constraint';
