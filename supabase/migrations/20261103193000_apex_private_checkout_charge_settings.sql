-- PR #193: private tax-collection flags, optional flat shipping and
-- free-shipping discount-code configuration. NEVER enables checkout.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.products') is null
  or to_regclass('public.stores') is null
  or to_regclass('public.supplier_memberships') is null
  or to_regclass('public.supplier_discount_codes') is null
  or not exists(select 1 from apex_internal.private_release_gate
    where singleton=true and enabled=false)
 then raise exception 'Checkout-rule configuration preflight denied';end if;
end $preflight$;

alter table public.products
 add column collect_sales_tax boolean not null default true;

create table public.apex_store_shipping_settings(
 store_id uuid primary key references public.stores(id) on delete restrict,
 charge_shipping boolean not null default false,
 flat_shipping_cents bigint not null default 0
   check(flat_shipping_cents between 0 and 999999999),
 free_shipping_min_subtotal_cents bigint
   check(free_shipping_min_subtotal_cents between 1 and 999999999),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 constraint valid_shipping_configuration check(
   charge_shipping or (flat_shipping_cents=0 and
     free_shipping_min_subtotal_cents is null)
 )
);
alter table public.apex_store_shipping_settings enable row level security;
alter table public.apex_store_shipping_settings force row level security;
revoke all on public.apex_store_shipping_settings from public,anon,authenticated;
grant select on public.apex_store_shipping_settings to authenticated;
create policy private_shipping_settings_read
 on public.apex_store_shipping_settings for select to authenticated
 using(
  (auth.uid() is not null and
   (auth.jwt() #>> '{app_metadata,apex_role}')='platform_admin')
  or exists(select 1 from public.stores s
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where s.id=apex_store_shipping_settings.store_id
    and sm.user_id=(select auth.uid()))
 );

create table public.apex_product_tax_setting_events(
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,
 changed_by uuid not null references auth.users(id),
 old_collect_sales_tax boolean not null,
 new_collect_sales_tax boolean not null,
 changed_at timestamptz not null default now(),
 check(old_collect_sales_tax<>new_collect_sales_tax)
);
create table public.apex_shipping_setting_events(
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id) on delete restrict,
 changed_by uuid not null references auth.users(id),
 old_settings jsonb not null,
 new_settings jsonb not null,
 changed_at timestamptz not null default now()
);
alter table public.apex_product_tax_setting_events enable row level security;
alter table public.apex_product_tax_setting_events force row level security;
alter table public.apex_shipping_setting_events enable row level security;
alter table public.apex_shipping_setting_events force row level security;
revoke all on public.apex_product_tax_setting_events from public,anon,authenticated;
revoke all on public.apex_shipping_setting_events from public,anon,authenticated;

-- Supplier owners/managers can change private store configuration; a
-- verified platform administrator can operate the same configuration.
-- Neither identity type grants product publication or checkout authority.
create function public.apex_can_edit_private_checkout_rules(
 p_store_id uuid
) returns boolean language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_actor uuid:=(select auth.uid());
begin
 if v_actor is null or p_store_id is null then return false;end if;
 return exists(select 1 from public.stores s
  where s.id=p_store_id and s.is_public=false
   and (
    ((select auth.jwt()) #>> '{app_metadata,apex_role}')='platform_admin'
    or exists(select 1 from public.supplier_memberships m
      where m.supplier_id=s.supplier_id and m.user_id=v_actor
       and m.role in('owner','manager'))
   ));
end $fn$;
revoke all on function public.apex_can_edit_private_checkout_rules(uuid)
 from public,anon,authenticated;
grant execute on function public.apex_can_edit_private_checkout_rules(uuid)
 to authenticated;

create function public.set_bulk_product_tax_collection(
 p_store_id uuid,p_product_ids uuid[],p_collect_sales_tax boolean
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_count integer;
 v_id uuid;
 v_current public.products%rowtype;
 v_updated integer:=0;
begin
 if not public.apex_can_edit_private_checkout_rules(p_store_id)
 then raise exception 'Private store editor required' using errcode='42501';end if;
 if p_collect_sales_tax is null or p_product_ids is null
  or cardinality(p_product_ids) not between 1 and 50
  or array_position(p_product_ids,null) is not null
  or array_ndims(p_product_ids)<>1
 then raise exception 'Select 1 to 50 valid products' using errcode='22023';end if;
 select count(distinct id) into v_count
 from unnest(p_product_ids) ids(id);
 if v_count<>cardinality(p_product_ids)
 then raise exception 'Duplicate products not allowed' using errcode='22023';end if;
 for v_id in select id from unnest(p_product_ids) ids(id) order by id
 loop
  select * into v_current from public.products p
   where p.id=v_id and p.store_id=p_store_id and not p.is_published
   for update;
  if not found then raise exception 'Product outside editable private store'
    using errcode='42501';end if;
  if v_current.collect_sales_tax is distinct from p_collect_sales_tax then
   update public.products set collect_sales_tax=p_collect_sales_tax
    where id=v_id and store_id=p_store_id and not is_published;
   insert into public.apex_product_tax_setting_events(
    store_id,product_id,changed_by,old_collect_sales_tax,new_collect_sales_tax
   ) values(p_store_id,v_id,v_actor,v_current.collect_sales_tax,p_collect_sales_tax);
   v_updated:=v_updated+1;
   -- Tax classification affects order totals; revoke stale draft review.
   if to_regprocedure('apex_internal.invalidate_private_review(uuid,uuid,text)') is not null
   then perform apex_internal.invalidate_private_review(
    p_store_id,v_id,'product');end if;
  end if;
 end loop;
 return jsonb_build_object('status','saved','selected',v_count,
  'changed',v_updated,'collect_sales_tax',p_collect_sales_tax,
  'checkout_enabled',false);
end $fn$;
revoke all on function public.set_bulk_product_tax_collection(uuid,uuid[],boolean)
 from public,anon,authenticated;
grant execute on function public.set_bulk_product_tax_collection(uuid,uuid[],boolean)
 to authenticated;

create function public.save_private_store_shipping_settings(
 p_store_id uuid,p_charge_shipping boolean,p_flat_shipping_cents bigint,
 p_free_shipping_min_subtotal_cents bigint
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_old public.apex_store_shipping_settings%rowtype;
 v_old_json jsonb;
 v_new_json jsonb;
begin
 if not public.apex_can_edit_private_checkout_rules(p_store_id)
 then raise exception 'Private store editor required' using errcode='42501';end if;
 if p_charge_shipping is null or p_flat_shipping_cents is null or
  p_flat_shipping_cents not between 0 and 999999999 or
  (p_free_shipping_min_subtotal_cents is not null
   and p_free_shipping_min_subtotal_cents not between 1 and 999999999)
  or (not p_charge_shipping and (p_flat_shipping_cents<>0
   or p_free_shipping_min_subtotal_cents is not null))
 then raise exception 'Invalid shipping configuration' using errcode='22023';end if;
 perform 1 from public.stores s where s.id=p_store_id and not s.is_public
  for update;
 if not found then raise exception 'Store no longer private' using errcode='42501';end if;
 select * into v_old from public.apex_store_shipping_settings s
  where s.store_id=p_store_id for update;
 v_old_json:=jsonb_build_object(
  'charge_shipping',coalesce(v_old.charge_shipping,false),
  'flat_shipping_cents',coalesce(v_old.flat_shipping_cents,0),
  'free_shipping_min_subtotal_cents',v_old.free_shipping_min_subtotal_cents);
 v_new_json:=jsonb_build_object(
  'charge_shipping',p_charge_shipping,
  'flat_shipping_cents',p_flat_shipping_cents,
  'free_shipping_min_subtotal_cents',p_free_shipping_min_subtotal_cents);
 if v_old_json<>v_new_json or not found then
  insert into public.apex_store_shipping_settings(
    store_id,charge_shipping,flat_shipping_cents,
    free_shipping_min_subtotal_cents,updated_by
  ) values(p_store_id,p_charge_shipping,p_flat_shipping_cents,
    p_free_shipping_min_subtotal_cents,v_actor)
  on conflict(store_id) do update set
   charge_shipping=excluded.charge_shipping,
   flat_shipping_cents=excluded.flat_shipping_cents,
   free_shipping_min_subtotal_cents=excluded.free_shipping_min_subtotal_cents,
   updated_by=excluded.updated_by,updated_at=now();
  insert into public.apex_shipping_setting_events(
   store_id,changed_by,old_settings,new_settings
  ) values(p_store_id,v_actor,v_old_json,v_new_json);
 end if;
 return v_new_json||jsonb_build_object('status','saved',
  'checkout_enabled',false);
end $fn$;
revoke all on function public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)
 from public,anon,authenticated;
grant execute on function public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)
 to authenticated;

-- Existing promotion table already enforces owner/manager RLS, code
-- validity, usage limits and launch dates. Preserve these; add a value-less
-- shipping benefit represented by discount_value=1 for compatibility.
alter table public.supplier_discount_codes drop constraint discount_kind_range;
alter table public.supplier_discount_codes drop constraint supplier_discount_codes_discount_kind_check;
alter table public.supplier_discount_codes add constraint discount_kind_range check(
 (discount_kind='percentage' and discount_value between 1 and 95)
 or (discount_kind='fixed' and discount_value between 1 and 999999999)
 or (discount_kind='free_shipping' and discount_value=1)
);
alter table public.supplier_discount_codes add constraint supplier_discount_codes_discount_kind_check
 check(discount_kind in ('percentage','fixed','free_shipping'));

create function public.get_admin_private_checkout_rules_overview(p_store_id uuid)
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_result jsonb;
begin
 if v_actor is null or (select auth.jwt())
  #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified admin required' using errcode='42501';end if;
 if not exists(select 1 from public.stores s
  where s.id=p_store_id and not s.is_public)
 then raise exception 'Private store required' using errcode='42501';end if;
 select jsonb_build_object(
  'store_id',s.id,'store_name',s.display_name,
  'products',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'sku',p.sku,
    'collect_sales_tax',p.collect_sales_tax) order by p.name)
   from (select * from public.products where store_id=p_store_id and not is_published
    order by name limit 250) p),'[]'::jsonb),
  'shipping',jsonb_build_object(
   'charge_shipping',coalesce(sh.charge_shipping,false),
   'flat_shipping_cents',coalesce(sh.flat_shipping_cents,0),
   'free_shipping_min_subtotal_cents',sh.free_shipping_min_subtotal_cents),
  'checkout_enabled',false
 ) into v_result from public.stores s
  left join public.apex_store_shipping_settings sh on sh.store_id=s.id
  where s.id=p_store_id;
 return v_result;
end $fn$;
revoke all on function public.get_admin_private_checkout_rules_overview(uuid)
 from public,anon,authenticated;
grant execute on function public.get_admin_private_checkout_rules_overview(uuid)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon','public.set_bulk_product_tax_collection(uuid,uuid[],boolean)','EXECUTE')
  or has_function_privilege('anon','public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
  or has_function_privilege('anon','public.get_admin_private_checkout_rules_overview(uuid)','EXECUTE')
  or has_table_privilege('authenticated','public.apex_store_shipping_settings','UPDATE')
  or has_table_privilege('authenticated','public.apex_product_tax_setting_events','INSERT')
  or has_table_privilege('authenticated','public.apex_shipping_setting_events','INSERT')
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Checkout-rule postflight denied';end if;
end $postflight$;
commit;
