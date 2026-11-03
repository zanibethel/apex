-- REVIEW ONLY: APEX gated PUBLIC Sold Out projection + matching private verdict.
-- DO NOT APPLY TO HOSTED SUPABASE WITHOUT EXPLICIT INDEPENDENT REVIEW.
-- Never updates customer data, products, supplier intent, inventory, wallets
-- or checkout. The gate remains false. No approval records are generated.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.private_release_gate') is null
  or to_regclass('apex_internal.supplier_release_authorizations') is null
  or to_regclass('apex_internal.product_release_authorizations') is null
  or to_regclass('apex_internal.listing_identity_holds') is null
  or to_regprocedure('public.set_supplier_listing_intent(uuid,uuid,text)') is null
  or to_regprocedure('public.get_private_release_readiness(uuid,uuid)') is null
  or to_regprocedure('public.get_public_sold_out_catalog()') is null
  or not exists(select 1 from apex_internal.private_release_gate
    where singleton=true and enabled=false)
  or not exists(select 1 from pg_constraint
    where conrelid='apex_internal.private_release_gate'::regclass
      and conname='private_release_gate_enabled_check'
      and pg_get_constraintdef(oid) ilike '%enabled = false%')
  or has_column_privilege('authenticated','public.products','is_published','UPDATE')
  or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_release_authorizations','UPDATE')
 then raise exception 'Apex sold-out release preflight denied';end if;
end $preflight$;

-- Allow a future independently authorized database migration to open the
-- global public-read gate. This file NEVER turns it on.
alter table apex_internal.private_release_gate
 drop constraint private_release_gate_enabled_check;

-- Single shared server predicate for the exact public projection AND the
-- supplier/admin status check. No product/public-table mutation.
create or replace function apex_internal.is_soldout_release_eligible(
 p_store_id uuid,p_product_id uuid
) returns boolean language sql stable security definer
 set search_path=pg_catalog as $fn$
 select exists(
  select 1 from public.products p
   join public.stores s on s.id=p.store_id and s.is_public=false
   join public.categories cat on cat.id=p.category_id
     and cat.store_id=p.store_id and cat.is_published=true
   join public.supplier_listing_controls c on c.store_id=p.store_id
     and c.product_id=p.id and c.supplier_wants_listing=true
     and c.admin_gate='clear'
     and (not c.republish_approval_required or c.republish_approved)
   join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
   join apex_internal.supplier_release_authorizations sa
     on sa.supplier_id=s.supplier_id
     and sa.status='verified' and sa.valid_until>=current_date
     and sa.reviewed_at is not null and sa.reviewed_by is not null
     and length(btrim(coalesce(sa.evidence_reference,'')))>0
   join apex_internal.product_release_authorizations pa
     on pa.store_id=p.store_id and pa.product_id=p.id
     and pa.status='verified' and pa.valid_until>=current_date
     and pa.reviewed_at is not null and pa.reviewed_by is not null
     and length(btrim(coalesce(pa.evidence_reference,'')))>0
   join apex_internal.private_release_gate gate
     on gate.singleton=true and gate.enabled=true
   left join public.private_product_review_states r
     on r.store_id=p.store_id and r.product_id=p.id
   left join public.supplier_candidate_drafts link
     on link.store_id=p.store_id and link.product_id=p.id
   left join public.supplier_import_candidates src
     on src.store_id=p.store_id and src.id=link.candidate_id
  where p.store_id=p_store_id and p.id=p_product_id
   and p.is_published=false and p.is_active=true
   and p.currency='USD' and p.price_cents between 1 and 999999999
   and length(btrim(p.name)) between 1 and 120
   and length(btrim(p.sku))>0
   and length(btrim(coalesce(p.description,'')))>0
   and length(coalesce(p.image_path,''))>0
   -- Sold Out is only accurate when real on-hand stock is zero.
   and i.quantity_on_hand=0 and i.quantity_reserved=0
   and coalesce(r.status,'') not in ('pending_review','changes_requested')
   and (link.candidate_id is null or src.review_status='approved_for_draft')
   and not exists(
    select 1 from apex_internal.listing_identity_holds h
    where h.supplier_id=s.supplier_id and h.active=true
     and h.signature=apex_internal.listing_signature(p.name)
   )
 );
$fn$;
revoke all on function
 apex_internal.is_soldout_release_eligible(uuid,uuid)
 from public,anon,authenticated;

create or replace function public.get_public_sold_out_catalog(
 p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if p_offset is null or p_offset<0 or p_offset>10000
  or p_limit is null or p_limit<1 or p_limit>24 then
  raise exception 'Invalid catalog page' using errcode='22023';
 end if;
 if not exists(select 1 from apex_internal.private_release_gate
    where singleton=true and enabled=true)
 then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',eligible.id,'name',eligible.name,'description',eligible.description,
  'price_cents',eligible.price_cents::text,
  'currency','USD','availability','sold_out','can_checkout',false
 ) order by eligible.name,eligible.id),'[]'::jsonb)
 into v_result from(
  select p.id,p.name,p.description,p.price_cents from public.products p
   where apex_internal.is_soldout_release_eligible(p.store_id,p.id)
   order by p.name,p.id limit p_limit offset p_offset
 ) eligible;
 return v_result;
end $fn$;
create or replace function public.get_public_sold_out_catalog()
returns jsonb language sql stable security definer set search_path=pg_catalog as $fn$
 select public.get_public_sold_out_catalog(0,24);
$fn$;
revoke all on function public.get_public_sold_out_catalog(integer,integer)
 from public,anon,authenticated;
revoke all on function public.get_public_sold_out_catalog()
 from public,anon,authenticated;
grant execute on function public.get_public_sold_out_catalog(integer,integer)
 to anon,authenticated;
grant execute on function public.get_public_sold_out_catalog()
 to anon,authenticated;

-- This protected status RPC mirrors the EXACT shared public predicate.
-- A checked supplier switch alone can never mark an offer publicly visible.
create or replace function public.get_private_release_readiness(
 p_store_id uuid,p_product_id uuid
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_admin boolean:=coalesce((select auth.jwt())
   #>> '{app_metadata,apex_role}'='platform_admin',false);
 v_p public.products%rowtype;
 v_supplier uuid;
 v_control public.supplier_listing_controls%rowtype;
 v_inventory public.inventory_items%rowtype;
 v_review text;
 v_sa apex_internal.supplier_release_authorizations%rowtype;
 v_pa apex_internal.product_release_authorizations%rowtype;
 v_identity_held boolean;
 v_category_published boolean;
 v_complete boolean;
 v_soldout_valid boolean;
 v_supplier_ok boolean;
 v_product_ok boolean;
 v_review_clear boolean;
 v_gate_on boolean;
 v_visible boolean;
 v_status text;
begin
 if v_actor is null then
  raise exception 'Authenticated identity required' using errcode='42501';
 end if;
 select * into v_p from public.products p
   where p.store_id=p_store_id and p.id=p_product_id;
 if not found then raise exception 'Product not found' using errcode='42501';end if;
 select s.supplier_id into v_supplier from public.stores s where s.id=p_store_id;
 if not v_admin and not exists(
   select 1 from public.supplier_memberships m
   where m.supplier_id=v_supplier and m.user_id=v_actor
    and m.role in('owner','manager')
 ) then raise exception 'Supplier owner/manager or platform admin required'
   using errcode='42501';
 end if;

 select * into v_control from public.supplier_listing_controls c
   where c.store_id=p_store_id and c.product_id=p_product_id;
 select * into v_inventory from public.inventory_items i
   where i.store_id=p_store_id and i.product_id=p_product_id;
 select r.status into v_review from public.private_product_review_states r
   where r.store_id=p_store_id and r.product_id=p_product_id;
 select * into v_sa from apex_internal.supplier_release_authorizations a
   where a.supplier_id=v_supplier;
 select * into v_pa from apex_internal.product_release_authorizations a
   where a.store_id=p_store_id and a.product_id=p_product_id;
 select exists(select 1 from public.categories cat
   where cat.id=v_p.category_id and cat.store_id=p_store_id
     and cat.is_published=true) into v_category_published;
 select exists(select 1 from apex_internal.listing_identity_holds h
   where h.supplier_id=v_supplier and h.active=true
    and h.signature=apex_internal.listing_signature(v_p.name))
 into v_identity_held;
 v_complete:=length(btrim(v_p.name))>0 and length(btrim(v_p.sku))>0
  and length(btrim(coalesce(v_p.description,'')))>0
  and v_p.category_id is not null and length(coalesce(v_p.image_path,''))>0
  and v_p.price_cents between 1 and 999999999
  and v_p.currency='USD' and v_p.is_active=true
  and v_p.is_published=false;
 v_soldout_valid:=v_inventory.product_id is not null
  and v_inventory.quantity_on_hand=0 and v_inventory.quantity_reserved=0;
 v_supplier_ok:=coalesce(v_sa.status='verified'
   and v_sa.valid_until>=current_date and v_sa.reviewed_at is not null
   and v_sa.reviewed_by is not null
   and length(btrim(coalesce(v_sa.evidence_reference,'')))>0,false);
 v_product_ok:=coalesce(v_pa.status='verified'
   and v_pa.valid_until>=current_date and v_pa.reviewed_at is not null
   and v_pa.reviewed_by is not null
   and length(btrim(coalesce(v_pa.evidence_reference,'')))>0,false);
 v_review_clear:=coalesce(v_review not in
  ('pending_review','changes_requested'),true);
 v_gate_on:=exists(select 1 from apex_internal.private_release_gate
   where singleton=true and enabled=true);
 v_visible:=apex_internal.is_soldout_release_eligible(p_store_id,p_product_id);
 v_status:=case
  when v_control.admin_gate='hold' then 'admin_hold'
  when v_control.admin_gate='review_required' or
   (coalesce(v_control.republish_approval_required,false)
    and not coalesce(v_control.republish_approved,false))
   then 'admin_review_required'
  when v_identity_held then 'same_supplier_identity_hold'
  when not coalesce(v_control.supplier_wants_listing,false)
   then 'supplier_not_requested'
  when not v_review_clear then 'content_review_pending'
  when not v_complete then 'product_setup_incomplete'
  when not v_category_published then 'category_not_published'
  when not v_soldout_valid then 'inventory_not_sold_out'
  when v_sa.status='suspended' then 'supplier_suspended'
  when not v_supplier_ok then 'supplier_authorization_unverified'
  when v_pa.status='blocked' then 'product_authorization_blocked'
  when not v_product_ok then 'product_authorization_unverified'
  when not v_gate_on then 'public_release_disabled'
  when v_visible then 'public_visible'
  else 'release_conditions_unverified'
 end;
 return jsonb_build_object(
  'status_code',v_status,
  'effective_public',v_visible,
  'checks',jsonb_build_object(
   'supplier_requested',coalesce(v_control.supplier_wants_listing,false),
   'admin_clear',coalesce(v_control.admin_gate='clear'
    and (not v_control.republish_approval_required or
          v_control.republish_approved),false),
   'same_supplier_identity_clear',not v_identity_held,
   'product_setup_complete',v_complete,
   'sold_out_inventory_valid',v_soldout_valid,
   'category_published',v_category_published,
   'supplier_authorized',v_supplier_ok,
   'product_authorized',v_product_ok,
   'content_review_clear',v_review_clear,
   'public_release_enabled',v_gate_on
  )
 );
end $fn$;
revoke all on function public.get_private_release_readiness(uuid,uuid)
 from public,anon;
grant execute on function public.get_private_release_readiness(uuid,uuid)
 to authenticated;

do $postflight$
begin
 if (select count(*) from apex_internal.private_release_gate where enabled)<>0
  or has_function_privilege('anon',
    'public.get_private_release_readiness(uuid,uuid)','EXECUTE')
  or has_function_privilege('anon',
    'apex_internal.is_soldout_release_eligible(uuid,uuid)','EXECUTE')
  or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
  or has_column_privilege('authenticated','public.products','is_published','UPDATE')
  or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
  or not has_function_privilege('anon',
    'public.get_public_sold_out_catalog(integer,integer)','EXECUTE')
 then raise exception 'Apex sold-out release postflight denied';end if;
end $postflight$;
commit;
