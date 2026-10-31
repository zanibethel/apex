-- REVIEW ONLY: supplier-controlled publishing intent with enforceable admin holds.
-- Deliberately DOES NOT enable public catalog listing, image delivery, orders or checkout.
-- Apply only to the existing Apex project after review. No temporary hosted DB.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.supplier_listing_controls') is not null
 or to_regclass('public.supplier_listing_events') is not null
 or to_regclass('public.private_product_review_states') is null
 or not (select relrowsecurity from pg_class where oid='public.products'::regclass)
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 then raise exception 'Apex listing-control preflight failed'; end if;
end $preflight$;

create table public.supplier_listing_controls(
 store_id uuid not null,
 product_id uuid not null,
 product_name text not null default '',
 product_sku text not null default '',
 supplier_wants_listing boolean not null default false,
 admin_gate text not null default 'clear'
   check(admin_gate in ('clear','hold','review_required')),
 republish_approval_required boolean not null default false,
 republish_approved boolean not null default false,
 reason text check(reason is null or length(reason)<=1000),
 changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now(),
 primary key(store_id,product_id),
 foreign key(store_id,product_id)
   references public.products(store_id,id) on delete cascade,
 constraint republish_gate_requires_prior_review check(
  not republish_approved or admin_gate='clear'
 )
);
create index supplier_listing_controls_gate_idx on
 public.supplier_listing_controls(admin_gate,changed_at desc);

create table public.supplier_listing_events(
 id bigint generated always as identity primary key,
 store_id uuid not null,
 product_id uuid not null,
 action text not null check(action in (
  'publish_requested','unpublish_requested','admin_hold',
  'admin_review_required','admin_republish_approved'
 )),
 actor_id uuid not null references auth.users(id),
 reason text check(reason is null or length(reason)<=1000),
 created_at timestamptz not null default now(),
 foreign key(store_id,product_id)
  references public.products(store_id,id) on delete cascade
);
create index supplier_listing_events_product_idx on
 public.supplier_listing_events(store_id,product_id,created_at desc);

alter table public.supplier_listing_controls enable row level security;
alter table public.supplier_listing_events enable row level security;
revoke all on public.supplier_listing_controls,public.supplier_listing_events
 from public,anon,authenticated;
grant select on public.supplier_listing_controls,public.supplier_listing_events
 to authenticated;

create policy "listing_controls_scoped_read" on public.supplier_listing_controls
 for select to authenticated using (
  (select auth.uid()) is not null and (
   (select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin'
   or exists (
    select 1 from public.stores s
    join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_listing_controls.store_id
     and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
  )
 );
create policy "listing_events_scoped_read" on public.supplier_listing_events
 for select to authenticated using (
  (select auth.uid()) is not null and (
   (select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin'
   or exists (
    select 1 from public.stores s
    join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_listing_events.store_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
  )
 );

-- Publishing intent is NOT the products.is_published column.
-- This trusted RPC validates membership and 8 required fields, but intentionally
-- does not grant any public listing or enable commerce.
create or replace function public.set_supplier_listing_intent(
 p_store_id uuid,p_product_id uuid,p_action text
) returns text language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_state public.supplier_listing_controls%rowtype;
 v_product public.products%rowtype;
begin
 if v_actor is null or p_action not in ('publish','unpublish')
 or not exists (
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and s.is_public=false
    and m.user_id=v_actor and m.role in ('owner','manager')
 ) then raise exception 'Authorized supplier owner/manager access required'; end if;

 select * into v_product from public.products p
 where p.store_id=p_store_id and p.id=p_product_id
  and p.is_published=false for update;
 if not found then raise exception 'Private product unavailable'; end if;

 insert into public.supplier_listing_controls(store_id,product_id,product_name,product_sku)
 values(p_store_id,p_product_id,v_product.name,v_product.sku)
 on conflict(store_id,product_id) do update
 set product_name=excluded.product_name,product_sku=excluded.product_sku;
 select * into v_state from public.supplier_listing_controls
  where store_id=p_store_id and product_id=p_product_id for update;

 if p_action='publish' then
  if apex_internal.private_product_review_snapshot(p_store_id,p_product_id) is null
  then raise exception 'Complete product details and stock before requesting publication';end if;
  if v_state.admin_gate<>'clear' or
     (v_state.republish_approval_required and not v_state.republish_approved)
  then raise exception 'Admin hold or review blocks supplier publication; administrator release required';end if;
  update public.supplier_listing_controls
  set supplier_wants_listing=true,changed_by=v_actor,changed_at=now()
  where store_id=p_store_id and product_id=p_product_id;
 else
  update public.supplier_listing_controls
  set supplier_wants_listing=false,changed_by=v_actor,changed_at=now()
  where store_id=p_store_id and product_id=p_product_id;
 end if;

 insert into public.supplier_listing_events(store_id,product_id,action,actor_id)
 values(p_store_id,p_product_id,
  case when p_action='publish' then 'publish_requested' else 'unpublish_requested' end,
  v_actor);
 return case when p_action='publish'
 then 'Publication preference saved; public release is still disabled'
 else 'Product removed from requested-publication list' end;
end $fn$;

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
 if p_action not in ('hold','require_review','approve_republish')
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
       else 'admin_republish_approved' end,v_actor,v_note);
 return 'Internal listing control saved. No public product or store visibility changed';
end $fn$;

revoke all on function public.set_supplier_listing_intent(uuid,uuid,text)
 from public,anon;
revoke all on function public.set_admin_listing_override(uuid,uuid,text,text)
 from public,anon;
grant execute on function public.set_supplier_listing_intent(uuid,uuid,text)
 to authenticated;
grant execute on function public.set_admin_listing_override(uuid,uuid,text,text)
 to authenticated;

-- These operations never mutate public.products.is_published,
-- public.categories.is_published or public.stores.is_public.
commit;