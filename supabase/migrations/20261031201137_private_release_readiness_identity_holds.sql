-- ALREADY APPLIED to existing Apex Supabase fhqpkpztercadcxspdkg.
-- Hosted version 20261031201137 / private_release_readiness_identity_holds.
-- Captured from merged PR #82; never reapply or blindly db push/reset.
-- REVIEW ONLY. Phase 1 effective publication decision engine.
-- Existing Apex Supabase only; intentionally does not publish products or enable commerce.
-- Only run after authorization to apply the separately reviewed migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.supplier_listing_controls') is null
 or to_regclass('public.supplier_listing_events') is null
 or to_regclass('apex_internal.private_release_gate') is not null
 or to_regclass('apex_internal.listing_identity_holds') is not null
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 then raise exception 'Private release engine preflight failed';end if;
end $preflight$;

-- Strongest safeguard: release is structurally OFF until a later migration,
-- authorization process and deploy are separately reviewed.
create table apex_internal.private_release_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false check(enabled=false)
);
insert into apex_internal.private_release_gate(singleton,enabled) values(true,false);

-- Staff cannot self-certify seller eligibility or product sale authorization.
-- These are evidence-review placeholders, with no authenticated mutation API.
create table apex_internal.supplier_release_authorizations(
 supplier_id uuid primary key references public.suppliers(id) on delete cascade,
 status text not null default 'unverified' check(status in('unverified','verified','suspended')),
 valid_until date,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 evidence_reference text
);
create table apex_internal.product_release_authorizations(
 store_id uuid not null,product_id uuid not null,
 status text not null default 'unverified' check(status in('unverified','verified','blocked')),
 valid_until date,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 evidence_reference text,
 primary key(store_id,product_id),
 foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade
);

-- Snapshot the product identity when the administrator imposes a hold.
-- Changing SKU or cloning a product into another store owned by the same supplier
-- does not defeat a match on the same normalized product name.
create table apex_internal.listing_identity_holds(
 store_id uuid not null,product_id uuid not null,
 supplier_id uuid not null references public.suppliers(id) on delete cascade,
 signature text not null check(length(signature)>0),
 active boolean not null default true,
 changed_at timestamptz not null default now(),
 primary key(store_id,product_id),
 foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade
);
create index listing_identity_holds_active_idx on apex_internal.listing_identity_holds(supplier_id,signature)
 where active;
revoke all on
 apex_internal.private_release_gate,
 apex_internal.supplier_release_authorizations,
 apex_internal.product_release_authorizations,
 apex_internal.listing_identity_holds
 from public,anon,authenticated;
alter table apex_internal.private_release_gate enable row level security;
alter table apex_internal.supplier_release_authorizations enable row level security;
alter table apex_internal.product_release_authorizations enable row level security;
alter table apex_internal.listing_identity_holds enable row level security;

create or replace function apex_internal.listing_signature(p_name text)
returns text language sql immutable set search_path=pg_catalog as $fn$
 select regexp_replace(lower(btrim(coalesce(p_name,''))),'[^a-z0-9]+','','g');
$fn$;
revoke all on function apex_internal.listing_signature(text) from public,anon,authenticated;

-- Backfill only already-existing admin holds; never enable any listing.
insert into apex_internal.listing_identity_holds(store_id,product_id,supplier_id,signature,active)
select c.store_id,c.product_id,s.supplier_id,
       apex_internal.listing_signature(c.product_name),true
 from public.supplier_listing_controls c
 join public.stores s on s.id=c.store_id
 where c.admin_gate in('hold','review_required')
   and length(apex_internal.listing_signature(c.product_name))>0;

create or replace function apex_internal.sync_listing_identity_hold()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_supplier uuid;v_signature text;
begin
 select s.supplier_id into v_supplier
 from public.stores s where s.id=new.store_id;
 if v_supplier is null then raise exception 'Unknown supplier for listing hold';end if;

 if new.admin_gate in('hold','review_required') then
  v_signature:=apex_internal.listing_signature(new.product_name);
  if length(v_signature)=0 then raise exception 'Held listing requires an identity';end if;
  insert into apex_internal.listing_identity_holds(
   store_id,product_id,supplier_id,signature,active,changed_at)
  values(new.store_id,new.product_id,v_supplier,v_signature,true,now())
  on conflict(store_id,product_id) do update set
   signature=excluded.signature,active=true,changed_at=now();

  -- Clear already-requested clone listings, including other storefronts of
  -- the same supplier. This is NOT public publication or a product mutation.
  update public.supplier_listing_controls c set
    supplier_wants_listing=false,changed_by=new.changed_by,changed_at=now()
   from public.stores s
   where s.id=c.store_id and s.supplier_id=v_supplier
     and c.supplier_wants_listing=true
     and apex_internal.listing_signature(c.product_name)=v_signature;
 else
  -- Admin release only clears the signature associated with that admin
  -- decision. Duplicates do not auto-republish; their intent was cleared.
  update apex_internal.listing_identity_holds set active=false,changed_at=now()
    where store_id=new.store_id and product_id=new.product_id;
 end if;
 return new;
end $fn$;
revoke all on function apex_internal.sync_listing_identity_hold()
 from public,anon,authenticated;

-- Existing admin RPC remains the sole app-level way to set an admin gate.
-- This trigger guarantees even future app changes maintain duplicate holds.
create trigger apex_release_sync_identity_hold
 after update of admin_gate on public.supplier_listing_controls
 for each row when(old.admin_gate is distinct from new.admin_gate)
 execute function apex_internal.sync_listing_identity_hold();

create or replace function apex_internal.reject_duplicate_held_request()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if new.supplier_wants_listing=true and
    exists(
      select 1 from public.stores s
      join apex_internal.listing_identity_holds h on h.supplier_id=s.supplier_id
      where s.id=new.store_id and h.active
       and h.signature=apex_internal.listing_signature(new.product_name)
    )
 then raise exception 'Listing identity held by administrator. Contact platform admin.';
 end if;
 return new;
end $fn$;
revoke all on function apex_internal.reject_duplicate_held_request()
 from public,anon,authenticated;
create trigger apex_release_reject_held_duplicate
 before insert or update of supplier_wants_listing
 on public.supplier_listing_controls for each row
 execute function apex_internal.reject_duplicate_held_request();

-- A single authoritative, READ-ONLY decision point for internal UI.
-- Security-definer is needed because normal supplier RLS does not expose
-- internal eligibility records. Every invocation checks the user's actual
-- membership or trusted platform-admin JWT; anon has NO EXECUTE permission.
create or replace function public.get_private_release_readiness(
 p_store_id uuid,p_product_id uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_admin boolean:=coalesce((select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin',false);
 v_p public.products%rowtype;
 v_supplier uuid;
 v_wants boolean;
 v_gate text;
 v_requires_approval boolean;
 v_approved boolean;
 v_stock integer;
 v_reserved integer;
 v_review_status text;
 v_seller_status text;
 v_seller_expires date;
 v_product_status text;
 v_product_expires date;
 v_identity_held boolean;
 v_complete boolean;
 v_stock_ok boolean;
 v_seller_ok boolean;
 v_product_ok boolean;
 v_reason text;
begin
 if v_actor is null then raise exception 'Authenticated identity required';end if;

 select p.* into v_p
 from public.products p
 where p.store_id=p_store_id and p.id=p_product_id;
 if not found then raise exception 'Product not found';end if;
 select s.supplier_id into v_supplier from public.stores s
  where s.id=p_store_id;

 if not v_admin and not exists(
  select 1 from public.supplier_memberships m
  where m.supplier_id=v_supplier and m.user_id=v_actor
    and m.role in('owner','manager')
 ) then raise exception 'Supplier owner/manager or platform admin required';end if;

 select c.supplier_wants_listing,c.admin_gate,c.republish_approval_required,
        c.republish_approved
 into v_wants,v_gate,v_requires_approval,v_approved
 from public.supplier_listing_controls c
 where c.store_id=p_store_id and c.product_id=p_product_id;
 v_wants:=coalesce(v_wants,false);v_gate:=coalesce(v_gate,'clear');
 v_requires_approval:=coalesce(v_requires_approval,false);
 v_approved:=coalesce(v_approved,false);

 select i.quantity_on_hand,i.quantity_reserved
 into v_stock,v_reserved from public.inventory_items i
 where i.store_id=p_store_id and i.product_id=p_product_id;
 select r.status into v_review_status from public.private_product_review_states r
 where r.store_id=p_store_id and r.product_id=p_product_id;
 select a.status,a.valid_until into v_seller_status,v_seller_expires
  from apex_internal.supplier_release_authorizations a
  where a.supplier_id=v_supplier;
 select a.status,a.valid_until into v_product_status,v_product_expires
  from apex_internal.product_release_authorizations a
  where a.store_id=p_store_id and a.product_id=p_product_id;

 select exists(
  select 1 from apex_internal.listing_identity_holds h
   where h.supplier_id=v_supplier and h.active
   and h.signature=apex_internal.listing_signature(v_p.name)
 ) into v_identity_held;

 v_complete:=length(btrim(v_p.name))>0 and length(btrim(v_p.sku))>0
   and length(btrim(coalesce(v_p.description,'')))>0
   and v_p.category_id is not null and length(coalesce(v_p.image_path,''))>0
   and v_p.price_cents>0 and v_p.is_active and v_p.currency='USD'
   and not v_p.is_published;
 v_stock_ok:=coalesce(v_stock-v_reserved,0)>0;
 v_seller_ok:=coalesce(v_seller_status='verified' and v_seller_expires>=current_date,false);
 v_product_ok:=coalesce(v_product_status='verified' and v_product_expires>=current_date,false);

 v_reason:=case
  when v_gate='hold' then 'admin_hold'
  when v_gate='review_required' or (v_requires_approval and not v_approved)
   then 'admin_review_required'
  when v_identity_held then 'same_supplier_identity_hold'
  when not v_wants then 'supplier_not_requested'
  when v_review_status in ('pending_review','changes_requested') then 'content_review_pending'
  when not v_complete then 'product_setup_incomplete'
  when not v_stock_ok then 'insufficient_available_stock'
  when v_seller_status='suspended' then 'supplier_suspended'
  when not v_seller_ok then 'supplier_authorization_unverified'
  when v_product_status='blocked' then 'product_authorization_blocked'
  when not v_product_ok then 'product_authorization_unverified'
  else 'public_release_disabled'
 end;
 return jsonb_build_object(
   'status_code',v_reason,
   'effective_public',false,
   'checks',jsonb_build_object(
    'supplier_requested',v_wants,'admin_clear',v_gate='clear'
     and (not v_requires_approval or v_approved),
    'same_supplier_identity_clear',not v_identity_held,
    'product_setup_complete',v_complete,
    'stock_available',v_stock_ok,
    'supplier_authorized',v_seller_ok,
    'product_authorized',v_product_ok,
    'content_review_clear',coalesce(v_review_status not in ('pending_review','changes_requested'),true),
    'public_release_enabled',false
   )
 );
end $fn$;

revoke all on function public.get_private_release_readiness(uuid,uuid)
 from public,anon;
grant execute on function public.get_private_release_readiness(uuid,uuid)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon','public.get_private_release_readiness(uuid,uuid)','EXECUTE')
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 or (select count(*) from apex_internal.private_release_gate where enabled)<>0
 or (select count(*) from pg_trigger where tgname='apex_release_sync_identity_hold'
     and tgrelid='public.supplier_listing_controls'::regclass and not tgisinternal)<>1
 then raise exception 'Release engine postflight failed';end if;
end $postflight$;
commit;
