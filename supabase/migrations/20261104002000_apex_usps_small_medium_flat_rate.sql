-- Add configurable USPS Priority Mail Flat Rate Small/Medium fees.
-- Monetary values are configurable saved cents; no carrier API or payment endpoint.
-- Historical 4-argument shipping editor is revoked to prevent bypassing the
-- paired-box policy. Existing store settings are never silently overwritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.apex_store_shipping_settings') is null
  or to_regclass('public.apex_shipping_setting_events') is null
  or to_regprocedure('public.apex_can_edit_private_checkout_rules(uuid)') is null
  or to_regprocedure('public.get_admin_private_checkout_charge_source(uuid,uuid,integer,text)') is null
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'USPS shipping migration preflight denied';end if;
end $preflight$;

alter table public.apex_store_shipping_settings
 add column medium_flat_shipping_cents bigint not null default 0
 check(medium_flat_shipping_cents between 0 and 999999999);
alter table public.apex_store_shipping_settings
 drop constraint valid_shipping_configuration;
alter table public.apex_store_shipping_settings
 add constraint valid_shipping_configuration check(
  charge_shipping or (flat_shipping_cents=0 and
   medium_flat_shipping_cents=0 and free_shipping_min_subtotal_cents is null)
 );

create function public.save_private_store_usps_shipping_settings(
 p_store_id uuid,p_charge_shipping boolean,
 p_small_flat_rate_cents bigint,p_medium_flat_rate_cents bigint,
 p_free_shipping_min_subtotal_cents bigint
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_old public.apex_store_shipping_settings%rowtype;
 v_exists boolean;
 v_old_json jsonb;
 v_new_json jsonb;
begin
 if not public.apex_can_edit_private_checkout_rules(p_store_id)
 then raise exception 'Private store editor required' using errcode='42501';end if;
 if p_charge_shipping is null or p_small_flat_rate_cents is null
  or p_medium_flat_rate_cents is null
  or p_small_flat_rate_cents not between 0 and 999999999
  or p_medium_flat_rate_cents not between 0 and 999999999
  or (p_charge_shipping and
    (p_small_flat_rate_cents<1 or p_medium_flat_rate_cents<p_small_flat_rate_cents
     or p_free_shipping_min_subtotal_cents is null
     or p_free_shipping_min_subtotal_cents not between 1 and 999999999))
  or (not p_charge_shipping and
    (p_small_flat_rate_cents<>0 or p_medium_flat_rate_cents<>0
     or p_free_shipping_min_subtotal_cents is not null))
 then raise exception 'Invalid USPS shipping configuration' using errcode='22023';end if;
 perform 1 from public.stores s where s.id=p_store_id and not s.is_public
  for update;
 if not found then raise exception 'Store no longer private' using errcode='42501';end if;
 select * into v_old from public.apex_store_shipping_settings s
  where s.store_id=p_store_id for update;
 v_exists:=found;
 v_old_json:=jsonb_build_object(
  'charge_shipping',coalesce(v_old.charge_shipping,false),
  'flat_shipping_cents',coalesce(v_old.flat_shipping_cents,0),
  'medium_flat_shipping_cents',coalesce(v_old.medium_flat_shipping_cents,0),
  'free_shipping_min_subtotal_cents',v_old.free_shipping_min_subtotal_cents);
 v_new_json:=jsonb_build_object(
  'charge_shipping',p_charge_shipping,
  'flat_shipping_cents',p_small_flat_rate_cents,
  'medium_flat_shipping_cents',p_medium_flat_rate_cents,
  'free_shipping_min_subtotal_cents',p_free_shipping_min_subtotal_cents);
 if not v_exists or v_old_json<>v_new_json then
  insert into public.apex_store_shipping_settings(
   store_id,charge_shipping,flat_shipping_cents,medium_flat_shipping_cents,
   free_shipping_min_subtotal_cents,updated_by
  ) values(p_store_id,p_charge_shipping,p_small_flat_rate_cents,p_medium_flat_rate_cents,
   p_free_shipping_min_subtotal_cents,v_actor)
  on conflict(store_id) do update set
   charge_shipping=excluded.charge_shipping,
   flat_shipping_cents=excluded.flat_shipping_cents,
   medium_flat_shipping_cents=excluded.medium_flat_shipping_cents,
   free_shipping_min_subtotal_cents=excluded.free_shipping_min_subtotal_cents,
   updated_by=excluded.updated_by,updated_at=now();
  insert into public.apex_shipping_setting_events(
   store_id,changed_by,old_settings,new_settings
  ) values(p_store_id,v_actor,v_old_json,v_new_json);
 end if;
 return v_new_json||jsonb_build_object('status','saved','checkout_enabled',false);
end $fn$;
revoke all on function public.save_private_store_usps_shipping_settings(
 uuid,boolean,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.save_private_store_usps_shipping_settings(
 uuid,boolean,bigint,bigint,bigint) to authenticated;
revoke execute on function public.save_private_store_shipping_settings(
 uuid,boolean,bigint,bigint) from public,anon,authenticated;

-- Extend the existing admin-only readback with both postage rates, while
-- retaining the same nonpayable schema_version=2 contract and promo rules.
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
   'medium_flat_shipping_cents',coalesce(v_shipping.medium_flat_shipping_cents,0),
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

do $postflight$
begin
 if has_function_privilege('anon',
  'public.save_private_store_usps_shipping_settings(uuid,boolean,bigint,bigint,bigint)','EXECUTE')
  or has_function_privilege('authenticated',
   'public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
  or has_table_privilege('authenticated','public.apex_store_shipping_settings','UPDATE')
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'USPS shipping migration permission postflight denied';end if;
end $postflight$;
commit;
