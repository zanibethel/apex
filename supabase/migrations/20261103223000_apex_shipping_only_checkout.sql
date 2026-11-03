-- PR #196: checkout uses merchandise + promo + optional shipping ONLY.
-- Remove callable tax-collection configuration and the product-tax readback.
-- Preserve historical columns and audit rows for external accounting review.
-- Does not activate catalog, stock reservations, checkout or BTCPay.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regprocedure('public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)') is null
  or to_regprocedure('public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)') is null
  or to_regprocedure('public.set_bulk_product_tax_collection(uuid,uuid[],boolean)') is null
  or to_regprocedure('public.get_admin_private_checkout_rules_overview(uuid)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Shipping-only migration preflight denied';end if;
end $preflight$;

create or replace function public.get_admin_private_checkout_charge_source(
 p_store_id uuid,p_product_id uuid,p_quantity integer,p_code text
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_product public.products%rowtype;
 v_shipping public.apex_store_shipping_settings%rowtype;
 v_promotion public.supplier_discount_codes%rowtype;
 v_promo_exists boolean:=false;
 v_code text;
 v_quantity_available integer;
 v_subtotal bigint;
begin
 if v_actor is null or (select auth.jwt())
    #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 if p_store_id is null or p_product_id is null or p_quantity is null
  or p_quantity not between 1 and 10 or p_code is null
  or length(p_code)>24
 then raise exception 'Invalid private checkout estimate request'
  using errcode='22023';end if;
 v_code:=btrim(p_code);
 if v_code<>'' and v_code !~ '^[A-Z0-9_-]{3,24}$'
 then raise exception 'Invalid promotion code' using errcode='22023';end if;
 if not exists(select 1 from public.stores s
  where s.id=p_store_id and s.is_public=false)
  or (select enabled from apex_internal.private_release_gate
     where singleton) is distinct from false
 then raise exception 'Private release gate required'
  using errcode='42501';end if;

 select * into v_product from public.products p
  where p.id=p_product_id and p.store_id=p_store_id
    and not p.is_published and p.currency='USD'
    and p.price_cents between 1 and 999999999;
 if not found then raise exception 'Private product unavailable'
  using errcode='42501';end if;
 v_subtotal:=v_product.price_cents*p_quantity;
 if v_subtotal>999999999 then
  raise exception 'Total exceeds limit' using errcode='22023';end if;
 select greatest(0,i.quantity_on_hand-i.quantity_reserved)
  into v_quantity_available from public.inventory_items i
  where i.store_id=p_store_id and i.product_id=p_product_id;
 select * into v_shipping from public.apex_store_shipping_settings s
  where s.store_id=p_store_id;
 if v_code<>'' then
  select * into v_promotion from public.supplier_discount_codes d
   where d.store_id=p_store_id and d.code=v_code;
  v_promo_exists:=found;
 end if;

 return jsonb_build_object(
  'schema_version',2,'state','private_shipping_charge_source',
  'store_id',p_store_id,'product_id',v_product.id,
  'name',v_product.name,'currency','USD',
  'quantity',p_quantity,'unit_price_cents',v_product.price_cents,
  'observed_subtotal_cents',v_subtotal,
  'quantity_available',v_quantity_available,
  'shipping',jsonb_build_object(
   'charge_shipping',coalesce(v_shipping.charge_shipping,false),
   'flat_shipping_cents',coalesce(v_shipping.flat_shipping_cents,0),
   'free_shipping_min_subtotal_cents',v_shipping.free_shipping_min_subtotal_cents),
  'requested_code',v_code,'promotion_found',v_promo_exists,
  'promotion',case when v_promo_exists then jsonb_build_object(
    'code',v_promotion.code,'is_active',v_promotion.is_active,
    'discount_kind',v_promotion.discount_kind,
    'discount_value',v_promotion.discount_value,
    'min_subtotal_cents',v_promotion.min_subtotal_cents,
    'starts_at',v_promotion.starts_at,'ends_at',v_promotion.ends_at,
    'usage_limit',v_promotion.usage_limit,
    'redemption_count',v_promotion.redemption_count)
   else null end,
  'can_create_order',false,'can_create_invoice',false,
  'can_reserve_stock',false,'can_pay',false,
  'checkout_enabled',false);
end $fn$;

-- Legacy product-tax RPCs cannot be called from the app anymore.
revoke execute on function public.set_bulk_product_tax_collection(uuid,uuid[],boolean)
 from public,anon,authenticated;
revoke execute on function public.get_admin_private_checkout_rules_overview(uuid)
 from public,anon,authenticated;

do $postflight$
begin
 if has_function_privilege('authenticated',
  'public.set_bulk_product_tax_collection(uuid,uuid[],boolean)','EXECUTE')
  or has_function_privilege('authenticated',
   'public.get_admin_private_checkout_rules_overview(uuid)','EXECUTE')
  or has_function_privilege('anon',
   'public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)','EXECUTE')
  or not has_function_privilege('authenticated',
   'public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Shipping-only migration postflight denied';end if;
end $postflight$;
commit;
