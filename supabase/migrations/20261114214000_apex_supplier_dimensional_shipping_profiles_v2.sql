-- Additive shipping profile data + read-only v2 public retail quote.
-- The V1 quote remains unchanged; neither order engine nor payment switches
-- are modified. A missing profile never invents physical dimensions.
begin;

create table if not exists public.supplier_product_shipping_profiles (
 store_id uuid not null,
 product_id uuid not null,
 length_mm integer not null check(length_mm between 1 and 2000),
 width_mm integer not null check(width_mm between 1 and 2000),
 height_mm integer not null check(height_mm between 1 and 2000),
 weight_g integer not null check(weight_g between 1 and 31750),
 flexible boolean not null default false,
 updated_by uuid not null default auth.uid(),
 updated_at timestamptz not null default now(),
 primary key(store_id,product_id),
 constraint shipping_profile_same_store_product foreign key(store_id,product_id)
   references public.products(store_id,id) on delete cascade
);
create index if not exists supplier_shipping_profiles_product_idx
 on public.supplier_product_shipping_profiles(product_id);
alter table public.supplier_product_shipping_profiles enable row level security;
revoke all on public.supplier_product_shipping_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.supplier_product_shipping_profiles to authenticated;

create policy shipping_profile_member_select
 on public.supplier_product_shipping_profiles for select to authenticated using(
  exists(select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where p.id=supplier_product_shipping_profiles.product_id
    and p.store_id=supplier_product_shipping_profiles.store_id
    and p.is_published=false and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager'))
 );
create policy shipping_profile_owner_insert
 on public.supplier_product_shipping_profiles for insert to authenticated with check(
  updated_by=(select auth.uid())
  and exists(select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where p.id=supplier_product_shipping_profiles.product_id
    and p.store_id=supplier_product_shipping_profiles.store_id
    and p.is_published=false and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager'))
 );
create policy shipping_profile_owner_update
 on public.supplier_product_shipping_profiles for update to authenticated using(
  exists(select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where p.id=supplier_product_shipping_profiles.product_id
    and p.store_id=supplier_product_shipping_profiles.store_id
    and p.is_published=false and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager'))
 ) with check (
  updated_by=(select auth.uid())
  and exists(select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where p.id=supplier_product_shipping_profiles.product_id
    and p.store_id=supplier_product_shipping_profiles.store_id
    and p.is_published=false and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager'))
 );
create policy shipping_profile_owner_delete
 on public.supplier_product_shipping_profiles for delete to authenticated using(
  exists(select 1 from public.products p
   join public.stores s on s.id=p.store_id
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where p.id=supplier_product_shipping_profiles.product_id
    and p.store_id=supplier_product_shipping_profiles.store_id
    and p.is_published=false and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager'))
 );

create or replace function apex_internal.capture_shipping_profile_audit()
 returns trigger language plpgsql security definer
 set search_path=pg_catalog as $audit$
declare
 v_store uuid;
 v_product uuid;
begin
 v_store:=case when tg_op='DELETE' then old.store_id else new.store_id end;
 v_product:=case when tg_op='DELETE' then old.product_id else new.product_id end;
 insert into public.supplier_catalog_audit(
  store_id,actor_id,entity_type,entity_id,operation,before_state,after_state)
 values(v_store,auth.uid(),'supplier_product_shipping_profiles',
  v_product::text,tg_op,
  case when tg_op='INSERT' then null else to_jsonb(old) end,
  case when tg_op='DELETE' then null else to_jsonb(new) end);
 if tg_op='DELETE' then return old;end if;
 return new;
end $audit$;
revoke all on function apex_internal.capture_shipping_profile_audit() from public,anon,authenticated;
create trigger apex_shipping_profiles_audit after insert or update or delete
 on public.supplier_product_shipping_profiles for each row
 execute function apex_internal.capture_shipping_profile_audit();

-- V2 wraps V1's already verified product visibility, stock, store identity,
-- pricing and promo rules. Extra output is only bounded dimensions and weight
-- for each product already present in the public retail quote.
create or replace function public.get_public_retail_cart_quote_source_v2(
 p_items jsonb,p_code text
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $quote$
declare
 v_source jsonb;
 v_item jsonb;
 v_profiles jsonb:='[]'::jsonb;
 v_profile jsonb;
begin
 v_source:=public.get_public_retail_cart_quote_source(p_items,p_code);
 if v_source->>'state'<>'rechecked_inventory_cart'
 then return v_source;end if;
 if jsonb_array_length(v_source->'items') not between 1 and 20
 then raise exception 'Invalid source items' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(v_source->'items') loop
  select jsonb_build_object(
    'product_id',pr.product_id,
    'length_mm',pr.length_mm,'width_mm',pr.width_mm,
    'height_mm',pr.height_mm,'weight_g',pr.weight_g,
    'flexible',pr.flexible
  ) into v_profile
  from public.supplier_product_shipping_profiles pr
  where pr.product_id=(v_item->>'product_id')::uuid
   and exists(select 1 from public.products p
     where p.id=pr.product_id and p.store_id=pr.store_id);
  v_profiles:=v_profiles||jsonb_build_array(coalesce(v_profile,'null'::jsonb));
 end loop;
 return v_source || jsonb_build_object(
  'schema_version',2,'shipping_profiles',v_profiles);
end $quote$;
revoke all on function public.get_public_retail_cart_quote_source_v2(jsonb,text)
 from public,anon,authenticated;
grant execute on function public.get_public_retail_cart_quote_source_v2(jsonb,text)
 to anon,authenticated;

comment on function public.get_public_retail_cart_quote_source_v2(jsonb,text)
 is 'Read-only v2 retail quote: V1 admission, prices and stock, plus bounded shipping profiles for already-public products. No checkout privileges.';
commit;
