-- PR #189: verified-admin-only server-calculated cart inspection.
-- Read existing catalog/stock/release verdicts; NEVER quote commercially,
-- reserve stock, create orders/invoices, activate a payment or publish an item.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regprocedure('public.get_private_release_readiness(uuid,uuid)') is null
  or to_regclass('apex_internal.checkout_order_intents') is null
  or to_regclass('public.inventory_items') is null
  or not exists(select 1 from apex_internal.private_release_gate
    where singleton=true and enabled=false)
 then raise exception 'Private cart validation preflight denied';end if;
end $preflight$;

create function public.get_admin_private_cart_validation(
 p_store_id uuid,p_items jsonb
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_row jsonb;
 v_id uuid;
 v_qty integer;
 v_seen uuid[]:=array[]::uuid[];
 v_product public.products%rowtype;
 v_inventory public.inventory_items%rowtype;
 v_decision jsonb;
 v_checks jsonb;
 v_available integer;
 v_price_ok boolean;
 v_stock_ok boolean;
 v_line bigint;
 v_subtotal bigint:=0;
 v_rows jsonb:='[]'::jsonb;
 v_item_count integer:=0;
begin
 if v_actor is null or (select auth.jwt())
   #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified admin required' using errcode='42501';end if;
 if p_store_id is null or
  not exists(select 1 from public.stores s
    where s.id=p_store_id and s.is_public=false)
 then raise exception 'Private store required' using errcode='42501';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array'
   or jsonb_array_length(p_items) not between 1 and 8
 then raise exception 'Choose between 1 and 8 items' using errcode='22023';end if;
 -- This is not a purchase permission. Prevent even private diagnostics if
 -- the global read-only release boundary was unexpectedly altered.
 if not exists(select 1 from apex_internal.private_release_gate
   where singleton=true and enabled=false)
 then raise exception 'Private inspection gate unavailable' using errcode='42501';end if;
 for v_row in select value from jsonb_array_elements(p_items)
 loop
  if jsonb_typeof(v_row)<>'object'
    or not(v_row ? 'product_id' and v_row ? 'quantity')
    or (select count(*) from jsonb_object_keys(v_row))<>2
    or jsonb_typeof(v_row->'product_id')<>'string'
    or (v_row->>'product_id') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or jsonb_typeof(v_row->'quantity')<>'number'
    or (v_row->>'quantity') !~ '^[1-9][0-9]?$'
  then raise exception 'Invalid cart item' using errcode='22023';end if;
  v_id:=(v_row->>'product_id')::uuid;
  v_qty:=(v_row->>'quantity')::integer;
  if v_qty>10 or v_id=any(v_seen)
  then raise exception 'Invalid quantity or duplicate product'
   using errcode='22023';end if;
  v_seen:=array_append(v_seen,v_id);
  v_item_count:=v_item_count+v_qty;
  if v_item_count>50 then raise exception 'Cart size limit'
   using errcode='22023';end if;
  select * into v_product from public.products p
   where p.id=v_id and p.store_id=p_store_id;
  if not found then raise exception 'Product does not belong to store'
   using errcode='42501';end if;
  select * into v_inventory from public.inventory_items i
   where i.store_id=p_store_id and i.product_id=v_id;
  v_available:=case when v_inventory.product_id is not null
    and v_inventory.quantity_on_hand>=v_inventory.quantity_reserved
    then v_inventory.quantity_on_hand-v_inventory.quantity_reserved
    else null end;
  v_price_ok:=v_product.price_cents between 1 and 999999999
    and v_product.currency='USD' and v_product.is_active=true
    and v_product.is_published=false;
  v_stock_ok:=v_available is not null and v_available>=v_qty
    and v_available>0;
  v_line:=case when v_price_ok
    then v_product.price_cents*v_qty else 0 end;
  if v_subtotal+v_line>999999999
  then raise exception 'Cart value limit' using errcode='22023';end if;
  v_subtotal:=v_subtotal+v_line;

  -- Existing privileged database verdict contains independent supplier,
  -- product, admin-review, and identity checks. NEVER trust browser flags.
  v_decision:=public.get_private_release_readiness(p_store_id,v_id);
  v_checks:=coalesce(v_decision->'checks','{}'::jsonb);
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
   'product_id',v_id,
   'quantity',v_qty,
   'name',v_product.name,
   'sku',v_product.sku,
   'currency','USD',
   'unit_price_cents',case when v_price_ok
     then v_product.price_cents::text else null end,
   'line_subtotal_cents',case when v_price_ok
     then v_line::text else null end,
   'available_units',v_available,
   'saved_price_valid',v_price_ok,
   'quantity_available',v_stock_ok,
   'release_status_code',coalesce(v_decision->>'status_code','unavailable'),
   'release_checks',jsonb_build_object(
     'supplier_requested',v_checks->>'supplier_requested'='true',
     'admin_clear',v_checks->>'admin_clear'='true',
     'identity_clear',v_checks->>'same_supplier_identity_clear'='true',
     'content_review_clear',v_checks->>'content_review_clear'='true',
     'product_setup_complete',v_checks->>'product_setup_complete'='true',
     'supplier_authorized',v_checks->>'supplier_authorized'='true',
     'product_authorized',v_checks->>'product_authorized'='true',
     'public_release_enabled',v_checks->>'public_release_enabled'='true'
   ),
   'can_order',false,
   'can_pay',false
  ));
 end loop;
 return jsonb_build_object(
  'schema_version',1,
  'state','private_cart_observation',
  'store_id',p_store_id,
  'items',v_rows,
  'total_units',v_item_count,
  'observed_subtotal_cents',v_subtotal::text,
  'currency','USD',
  'shipping_calculated',false,
  'tax_calculated',false,
  'can_quote',false,
  'can_reserve_stock',false,
  'can_create_order',false,
  'can_create_invoice',false,
  'can_pay',false
 );
end $fn$;

revoke all on function public.get_admin_private_cart_validation(uuid,jsonb)
 from PUBLIC,anon,authenticated;
grant execute on function public.get_admin_private_cart_validation(uuid,jsonb)
 to authenticated;
do $postflight$
begin
 if has_function_privilege('anon',
    'public.get_admin_private_cart_validation(uuid,jsonb)','EXECUTE')
  or has_table_privilege('authenticated',
    'apex_internal.checkout_order_intents','INSERT')
  or has_table_privilege('authenticated',
    'apex_internal.btcpay_invoice_post_intents','INSERT')
  or (select enabled from apex_internal.private_release_gate
       where singleton=true) is distinct from false
 then raise exception 'Cart validation postflight denied';end if;
end $postflight$;
commit;
