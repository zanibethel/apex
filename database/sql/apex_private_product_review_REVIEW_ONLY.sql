-- REVIEW-ONLY until independently approved for the existing Apex Supabase project.
-- Internal supplier content review. NO publishing, checkout, payments or fulfillment.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if not (select relrowsecurity from pg_class where oid='public.products'::regclass)
 or not exists (select 1 from pg_constraint where conrelid='public.products'::regclass
  and contype='u' and pg_get_constraintdef(oid) like '%store_id, id%')
 or to_regclass('public.private_product_review_states') is not null
 then raise exception 'Apex review workflow preflight failed: inspect current catalog schema'; end if;
end $preflight$;

create table public.private_product_review_states (
 store_id uuid not null,
 product_id uuid not null,
 submission_id uuid not null default gen_random_uuid(),
 status text not null check(status in ('pending_review','changes_requested','approved_internal')),
 snapshot jsonb not null,
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),
 decided_at timestamptz,
 review_note text check(review_note is null or char_length(review_note)<=1000),
 updated_at timestamptz not null default now(),
 primary key(store_id,product_id),
 foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade
);
create index private_product_review_states_status_idx
 on public.private_product_review_states(status,submitted_at desc);

create table public.private_product_review_history (
 id bigint generated always as identity primary key,
 store_id uuid not null,
 product_id uuid not null,
 submission_id uuid not null,
 event_type text not null check(event_type in ('submitted','resubmitted','changes_requested','approved_internal')),
 actor_id uuid not null references auth.users(id),
 note text check(note is null or char_length(note)<=1000),
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade
);
create index private_product_review_history_product_idx
 on public.private_product_review_history(store_id,product_id,created_at desc);

alter table public.private_product_review_states enable row level security;
alter table public.private_product_review_history enable row level security;
revoke all on public.private_product_review_states,public.private_product_review_history
 from public,anon,authenticated;
grant select on public.private_product_review_states,public.private_product_review_history
 to authenticated;

create policy "review_state_private_read" on public.private_product_review_states
 for select to authenticated using (
  (select auth.uid()) is not null and (
   (select auth.jwt()) #>> '{app_metadata,apex_role}' = 'platform_admin'
   or exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=private_product_review_states.store_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
  )
 );
create policy "review_history_private_read" on public.private_product_review_history
 for select to authenticated using (
  (select auth.uid()) is not null and (
   (select auth.jwt()) #>> '{app_metadata,apex_role}' = 'platform_admin'
   or exists (
    select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=private_product_review_history.store_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
   )
  )
 );

create or replace function apex_internal.private_product_review_snapshot(p_store_id uuid,p_product_id uuid)
returns jsonb language sql stable set search_path=pg_catalog as $fn$
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
   and i.quantity_on_hand>0 and i.quantity_reserved between 0 and i.quantity_on_hand;
$fn$;
revoke all on function apex_internal.private_product_review_snapshot(uuid,uuid)
 from public,anon,authenticated;

create or replace function public.submit_private_product_review(p_store_id uuid,p_product_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_snapshot jsonb;
 v_prior_status text;
 v_submission uuid:=gen_random_uuid();
begin
 if v_actor is null or not exists (
  select 1 from public.stores s join public.supplier_memberships m
    on m.supplier_id=s.supplier_id
  where s.id=p_store_id and s.is_public=false and m.user_id=v_actor
    and m.role in ('owner','manager')
 ) then raise exception 'Supplier owner/manager access required'; end if;

 -- Serialize concurrent submit/decision operations for the same draft.
 perform 1 from public.products p
 where p.store_id=p_store_id and p.id=p_product_id and p.is_published=false
 for update;
 if not found then raise exception 'Private draft not available'; end if;

 v_snapshot:=apex_internal.private_product_review_snapshot(p_store_id,p_product_id);
 if v_snapshot is null then raise exception 'Complete all eight internal product setup steps first'; end if;

 select status into v_prior_status from public.private_product_review_states
  where store_id=p_store_id and product_id=p_product_id for update;
 if v_prior_status in ('pending_review','approved_internal') then
  raise exception 'This draft is already submitted or internally reviewed'; end if;

 insert into public.private_product_review_states
 (store_id,product_id,submission_id,status,snapshot,submitted_by,submitted_at,decided_by,decided_at,review_note)
 values(p_store_id,p_product_id,v_submission,'pending_review',v_snapshot,v_actor,now(),null,null,null)
 on conflict (store_id,product_id) do update
 set submission_id=excluded.submission_id,status='pending_review',snapshot=excluded.snapshot,
 submitted_by=v_actor,submitted_at=now(),decided_by=null,decided_at=null,review_note=null,updated_at=now();

 insert into public.private_product_review_history
 (store_id,product_id,submission_id,event_type,actor_id,note,snapshot)
 values(p_store_id,p_product_id,v_submission,
  case when v_prior_status='changes_requested' then 'resubmitted' else 'submitted' end,
  v_actor,null,v_snapshot);
 return v_submission;
end $fn$;

create or replace function public.decide_private_product_review(
 p_store_id uuid,p_product_id uuid,p_submission_id uuid,p_decision text,p_note text
)
returns text language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_saved public.private_product_review_states%rowtype;
 v_current jsonb;
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if v_actor is null or (select auth.jwt()) #>> '{app_metadata,apex_role}' <> 'platform_admin'
 then raise exception 'Verified platform administrator access required'; end if;
 if p_decision not in ('changes_requested','approved_internal') or
    char_length(coalesce(p_note,''))>1000 or
    (p_decision='changes_requested' and v_note is null)
 then raise exception 'Choose a valid internal decision and explain requested changes'; end if;

 perform 1 from public.products
 where store_id=p_store_id and id=p_product_id and is_published=false for update;
 if not found then raise exception 'Private product unavailable'; end if;
 select * into v_saved from public.private_product_review_states
  where store_id=p_store_id and product_id=p_product_id for update;
 if not found or v_saved.status<>'pending_review'
    or v_saved.submission_id is distinct from p_submission_id
 then raise exception 'Review submission changed; refresh before deciding'; end if;

 v_current:=apex_internal.private_product_review_snapshot(p_store_id,p_product_id);
 if p_decision='approved_internal' and (v_current is null or v_current<>v_saved.snapshot)
 then raise exception 'Product setup changed since submission; request changes and resubmit'; end if;

 update public.private_product_review_states
  set status=p_decision,review_note=v_note,decided_by=v_actor,
      decided_at=now(),updated_at=now()
  where store_id=p_store_id and product_id=p_product_id;
 insert into public.private_product_review_history
  (store_id,product_id,submission_id,event_type,actor_id,note,snapshot)
 values(p_store_id,p_product_id,p_submission_id,p_decision,v_actor,v_note,v_saved.snapshot);
 return p_decision;
end $fn$;

revoke all on function public.submit_private_product_review(uuid,uuid) from public,anon;
revoke all on function public.decide_private_product_review(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.submit_private_product_review(uuid,uuid) to authenticated;
grant execute on function public.decide_private_product_review(uuid,uuid,uuid,text,text) to authenticated;

-- Review state is not a product publication flag. No privilege granted on
-- products.is_published, stores.is_public or categories.is_published.
commit;
