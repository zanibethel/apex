-- REVIEWED source of hosted Apex migration named
-- apex_simple_zero_stock_listing_and_owner_unpublish, applied 2026-11-02 UTC.
-- No public product release, payment, or stock changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regprocedure('apex_internal.private_product_review_snapshot(uuid,uuid)') is null
    or to_regprocedure('public.set_supplier_listing_intent(uuid,uuid,text)') is null
    or to_regprocedure('public.set_admin_listing_override(uuid,uuid,text,text)') is null
    or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
    or not exists(select 1 from pg_constraint
       where conrelid='public.supplier_listing_events'::regclass
         and conname='supplier_listing_events_action_check')
 then raise exception 'Apex simple listing preflight failed';end if;
end $preflight$;

-- Product completeness must accept real zero stock; zero is SOLD OUT.
-- This affects PRIVATE review/listing intent, not independently gated sales.
create or replace function apex_internal.private_product_review_snapshot(
 p_store_id uuid,p_product_id uuid
) returns jsonb language sql stable set search_path=pg_catalog as $fn$
 select jsonb_build_object(
  'name',p.name,'sku',p.sku,'description',p.description,
  'category_id',p.category_id,'image_path',p.image_path,
  'price_cents',p.price_cents,'is_active',p.is_active,
  'quantity_on_hand',i.quantity_on_hand,'quantity_reserved',i.quantity_reserved
 )
 from public.products p
 join public.stores s on s.id=p.store_id and s.is_public=false
 join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
 where p.store_id=p_store_id and p.id=p_product_id and p.is_published=false
   and length(btrim(p.name))>0 and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,'')))>0
   and p.category_id is not null and length(coalesce(p.image_path,''))>0
   and p.price_cents>0 and p.is_active=true
   and i.quantity_on_hand>=0 and i.quantity_reserved between 0 and i.quantity_on_hand;
$fn$;

alter table public.supplier_listing_events drop constraint supplier_listing_events_action_check;
alter table public.supplier_listing_events add constraint supplier_listing_events_action_check
 check(action in(
 'publish_requested','unpublish_requested','admin_unpublish',
 'admin_hold','admin_review_required','admin_republish_approved'
 ));

-- Same privileged and audited owner function as before, with 'unpublish'
-- action that clears intent but does NOT silently impose a hold.
create or replace function public.set_admin_listing_override(
 p_store_id uuid,p_product_id uuid,p_action text,p_reason text
) returns text language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_state public.supplier_listing_controls%rowtype;
 v_product public.products%rowtype;
 v_note text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
 if v_actor is null or
 (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform administrator access required';end if;
 if p_action is null or p_action not in ('hold','require_review','approve_republish','unpublish')
 or length(coalesce(p_reason,''))>1000
 or (p_action in ('hold','require_review') and v_note is null)
 then raise exception 'Valid admin action and explanatory note required';end if;

 select * into v_product from public.products p
 where p.id=p_product_id and p.store_id=p_store_id
  and p.is_published=false for update;
 if not found then raise exception 'Private product unavailable';end if;

 insert into public.supplier_listing_controls(store_id,product_id,product_name,product_sku)
 values(p_store_id,p_product_id,v_product.name,v_product.sku)
 on conflict(store_id,product_id) do update
 set product_name=excluded.product_name,product_sku=excluded.product_sku;
 select * into v_state from public.supplier_listing_controls
 where store_id=p_store_id and product_id=p_product_id for update;

 if p_action='approve_republish' then
   if v_state.admin_gate='clear' and not v_state.republish_approval_required
   then raise exception 'This product has no admin review restriction to release';end if;
   -- Releasing a hold does not automatically publish: supplier opts in again.
   update public.supplier_listing_controls set
    admin_gate='clear',republish_approval_required=false,
    republish_approved=true,supplier_wants_listing=false,
    reason=v_note,changed_by=v_actor,changed_at=now()
   where store_id=p_store_id and product_id=p_product_id;
 elsif p_action='unpublish' then
   update public.supplier_listing_controls set
    supplier_wants_listing=false,reason=v_note,changed_by=v_actor,changed_at=now()
   where store_id=p_store_id and product_id=p_product_id;
 else
   update public.supplier_listing_controls set
    admin_gate=case when p_action='hold' then 'hold' else 'review_required' end,
    republish_approval_required=true,republish_approved=false,
    supplier_wants_listing=false,
    reason=v_note,changed_by=v_actor,changed_at=now()
   where store_id=p_store_id and product_id=p_product_id;
 end if;

 insert into public.supplier_listing_events(
 store_id,product_id,action,actor_id,reason)
 values(p_store_id,p_product_id,
  case when p_action='hold' then 'admin_hold'
       when p_action='require_review' then 'admin_review_required'
       when p_action='unpublish' then 'admin_unpublish'
       else 'admin_republish_approved' end,v_actor,v_note);
 return 'Internal listing control saved. No public product or store visibility changed';
end $fn$;


do $postflight$
begin
 if has_function_privilege('anon','public.set_admin_listing_override(uuid,uuid,text,text)','EXECUTE')
    or has_function_privilege('anon','public.set_supplier_listing_intent(uuid,uuid,text)','EXECUTE')
    or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Apex listing security postflight failed';end if;
end $postflight$;
commit;
