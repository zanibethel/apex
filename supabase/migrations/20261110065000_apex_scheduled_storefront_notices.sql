-- Scheduled, rotating storefront notices managed by verified Apex owners/managers.
-- Display is read-only and never opens checkout or payment controls.
begin;
create table if not exists apex_internal.apex_storefront_notices (
 id uuid primary key default gen_random_uuid(),
 store_id uuid references public.stores(id) on delete cascade,
 headline text not null,
 detail text not null default '',
 href text,
 starts_at timestamptz,
 ends_at timestamptz,
 is_active boolean not null default false,
 priority smallint not null default 0,
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint apex_notice_headline_len check (length(btrim(headline)) between 3 and 120),
 constraint apex_notice_detail_len check (length(detail)<=240),
 constraint apex_notice_link_safe check(href is null or href in ('/','/catalog')),
 constraint apex_notice_dates_valid check (starts_at is null or ends_at is null or ends_at>starts_at),
 constraint apex_notice_priority_valid check(priority between 0 and 10)
);
create index if not exists apex_storefront_notices_window
 on apex_internal.apex_storefront_notices(is_active,starts_at,ends_at,priority desc);
create table if not exists apex_internal.apex_storefront_notice_events(
 id bigint generated always as identity primary key,
 notice_id uuid not null references apex_internal.apex_storefront_notices(id) on delete cascade,
 actor_id uuid not null,
 action text not null check(action in ('create','update','activate','deactivate')),
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default now()
);
alter table apex_internal.apex_storefront_notices enable row level security;
alter table apex_internal.apex_storefront_notice_events enable row level security;
revoke all on apex_internal.apex_storefront_notices from public,anon,authenticated;
revoke all on apex_internal.apex_storefront_notice_events from public,anon,authenticated;

-- Public projection is sanitized and includes upcoming notices for client-side
-- start/end cutover without a scheduled worker. No private actor or store data.
create or replace function public.get_apex_public_notices()
 returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',q.id,'headline',q.headline,'detail',q.detail,'href',q.href,
  'starts_at',q.starts_at,'ends_at',q.ends_at
 ) order by q.priority desc,q.created_at desc,q.id),'[]'::jsonb)
 from (
  select n.id,n.headline,n.detail,n.href,n.starts_at,n.ends_at,n.priority,n.created_at
  from apex_internal.apex_storefront_notices n
  where n.is_active=true
   and (n.ends_at is null or n.ends_at>now())
   and (n.starts_at is null or n.starts_at<now()+interval '90 days')
  order by n.priority desc,n.created_at desc,n.id limit 24
 ) q
$$;
revoke all on function public.get_apex_public_notices() from public;
grant execute on function public.get_apex_public_notices() to anon,authenticated;

create or replace function public.get_apex_manageable_notices(p_store_id uuid default null)
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=(select auth.uid());
 v_admin boolean:=coalesce((select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin',false);
 v_result jsonb;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not v_admin and (p_store_id is null or not exists(
  select 1 from public.stores s join public.supplier_memberships m
   on m.supplier_id=s.supplier_id
  where s.id=p_store_id and s.is_public=false and m.user_id=v_actor
    and m.role in ('owner','manager')
 )) then raise exception 'Supplier owner or manager required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',q.id,'store_id',q.store_id,'headline',q.headline,'detail',q.detail,'href',q.href,
  'starts_at',q.starts_at,'ends_at',q.ends_at,'is_active',q.is_active,
  'priority',q.priority,'updated_at',q.updated_at
 ) order by q.priority desc,q.updated_at desc),'[]'::jsonb)
 into v_result
 from (
  select n.* from apex_internal.apex_storefront_notices n
  where (p_store_id is null or n.store_id=p_store_id)
   and (v_admin or n.store_id=p_store_id)
  order by n.priority desc,n.updated_at desc limit 100
 ) q;
 return v_result;
end $$;
revoke all on function public.get_apex_manageable_notices(uuid) from public,anon;
grant execute on function public.get_apex_manageable_notices(uuid) to authenticated;

create or replace function public.save_apex_storefront_notice(
 p_id uuid,p_store_id uuid,p_headline text,p_detail text,p_href text,
 p_starts_at timestamptz,p_ends_at timestamptz,p_active boolean,
 p_priority smallint,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_actor uuid:=(select auth.uid());
 v_admin boolean:=coalesce((select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin',false);
 v_row apex_internal.apex_storefront_notices%rowtype;
 v_before jsonb;
 v_action text;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_store_id is null and not v_admin
 then raise exception 'Only platform admins can manage global notices' using errcode='42501';end if;
 if p_store_id is not null and not v_admin and not exists(
  select 1 from public.stores s join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and s.is_public=false and m.user_id=v_actor
   and m.role in ('owner','manager')
 ) then raise exception 'Supplier owner or manager required' using errcode='42501';end if;
 if p_active is null or p_priority is null or p_priority not between 0 and 10 or
  p_headline is null or length(btrim(p_headline)) not between 3 and 120 or
  length(coalesce(p_detail,''))>240 or
  (p_href is not null and p_href not in ('/','/catalog')) or
  (p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at)
 then raise exception 'Invalid notice fields or schedule' using errcode='22023';end if;
 if p_store_id is not null and not exists(select 1 from public.stores
  where id=p_store_id and is_public=false)
 then raise exception 'Private store unavailable' using errcode='22023';end if;

 if p_id is not null then
  select * into v_row from apex_internal.apex_storefront_notices
   where id=p_id for update;
  if not found or v_row.store_id is distinct from p_store_id
  then raise exception 'Notice not available for this store' using errcode='42501';end if;
  if p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at
  then raise exception 'Notice changed; review the latest version before saving' using errcode='40001';end if;
  v_before:=to_jsonb(v_row);
  update apex_internal.apex_storefront_notices n set
   headline=btrim(p_headline),detail=coalesce(p_detail,''),href=p_href,
   starts_at=p_starts_at,ends_at=p_ends_at,is_active=p_active,
   priority=p_priority,updated_by=v_actor,updated_at=clock_timestamp()
  where n.id=p_id returning * into v_row;
  v_action:=case when (v_before->>'is_active')::boolean is distinct from p_active
   then case when p_active then 'activate' else 'deactivate' end
   else 'update' end;
 else
  insert into apex_internal.apex_storefront_notices(
   store_id,headline,detail,href,starts_at,ends_at,is_active,
   priority,created_by,updated_by)
  values(p_store_id,btrim(p_headline),coalesce(p_detail,''),p_href,p_starts_at,
   p_ends_at,p_active,p_priority,v_actor,v_actor)
  returning * into v_row;
  v_action:='create';
 end if;
 insert into apex_internal.apex_storefront_notice_events(notice_id,actor_id,action,before_state,after_state)
 values(v_row.id,v_actor,v_action,v_before,to_jsonb(v_row));
 return jsonb_build_object('id',v_row.id,'updated_at',v_row.updated_at,
  'headline',v_row.headline,'is_active',v_row.is_active);
end $$;
revoke all on function public.save_apex_storefront_notice(
 uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,smallint,timestamptz) from public,anon;
grant execute on function public.save_apex_storefront_notice(
 uuid,uuid,text,text,text,timestamptz,timestamptz,boolean,smallint,timestamptz) to authenticated;
commit;
