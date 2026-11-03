-- PR #178. Admin-only category publication controls + append-only audit.
-- This migration ONLY adds an authenticated admin workflow. It NEVER publishes
-- a category, grants public product access, enables the global release gate,
-- or verifies supplier/product eligibility by itself.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.categories') is null
  or to_regclass('public.products') is null
  or to_regclass('public.stores') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or not exists(select 1 from apex_internal.private_release_gate
      where singleton=true and enabled=false)
  or has_column_privilege('authenticated','public.categories','is_published','UPDATE')
  or has_table_privilege('anon','public.categories','UPDATE')
 then raise exception 'Admin category controls preflight denied';end if;
end $preflight$;

create table public.apex_category_publication_events (
 id bigint generated always as identity primary key,
 store_id uuid not null,
 category_id uuid not null,
 category_name text not null,
 action text not null check(action in ('publish','unpublish')),
 reason text,
 actor_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 foreign key(store_id,category_id)
  references public.categories(store_id,id) on delete restrict,
 check (reason is null or length(reason) between 3 and 600)
);
create index apex_category_publication_events_lookup_idx on
 public.apex_category_publication_events(store_id,category_id,id desc);
alter table public.apex_category_publication_events enable row level security;
revoke all on public.apex_category_publication_events
 from public,anon,authenticated;
grant select on public.apex_category_publication_events to authenticated;
create policy apex_category_publication_events_admin_read
 on public.apex_category_publication_events for select to authenticated
 using (
  (select auth.uid()) is not null
   and (select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin'
 );

-- The only writer. No user_metadata access, caller-supplied actor or
-- supplier capability: the trusted app_metadata identity must be admin.
create function public.set_admin_category_publication(
 p_store_id uuid,p_category_id uuid,p_action text,p_reason text
) returns text language plpgsql security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_note text:=nullif(btrim(coalesce(p_reason,'')),'');
 v_category public.categories%rowtype;
 v_new_value boolean;
begin
 if v_actor is null or (select auth.jwt())
    #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
     using errcode='42501';end if;
 if p_action is null or p_action not in ('publish','unpublish')
  or length(coalesce(p_reason,''))>600
  or (p_action='publish' and
     (v_note is null or length(v_note)<3))
  or (v_note is not null and length(v_note)<3)
 then raise exception 'Valid category action and short audit reason required'
    using errcode='22023';end if;
 -- Preserve private supplier editor assumptions. A category is a release
 -- prerequisite, never a product approval or a public store flag.
 if not exists(select 1 from public.stores s
   where s.id=p_store_id and s.is_public=false)
 then raise exception 'Private storefront unavailable'
     using errcode='42501';end if;
 select * into v_category from public.categories c
  where c.id=p_category_id and c.store_id=p_store_id
  for update;
 if not found then raise exception 'Category does not belong to storefront'
    using errcode='42501';end if;
 v_new_value:=p_action='publish';
 if v_category.is_published=v_new_value
 then return 'Category setting unchanged';end if;
 update public.categories
 set is_published=v_new_value
 where id=p_category_id and store_id=p_store_id;
 insert into public.apex_category_publication_events(
   store_id,category_id,category_name,action,reason,actor_id
 ) values (
   p_store_id,p_category_id,v_category.name,p_action,v_note,v_actor
 );
 return case when v_new_value
  then 'Category enabled; product release and checkout restrictions still apply'
  else 'Category hidden from public gallery' end;
end $fn$;

-- A bounded admin-only readback is necessary because normal category RLS
-- intentionally does NOT grant global admins direct private supplier reads.
create function public.get_admin_category_publication_overview()
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_rows jsonb;
begin
 if (select auth.uid()) is null or
  (select auth.jwt()) #>> '{app_metadata,apex_role}'
     is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
   using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'store_id',q.store_id,'category_id',q.id,
   'store_name',q.store_name,'category_name',q.name,
   'is_published',q.is_published,'product_count',q.product_count,
   'active_count',q.active_count
 ) order by q.store_name,q.name,q.id),'[]'::jsonb)
 into v_rows
 from (
  select c.id,c.store_id,c.name,c.is_published,
    s.display_name as store_name,
    count(p.id)::integer as product_count,
    count(p.id) filter(where p.is_active)::integer as active_count
  from public.categories c
  join public.stores s on s.id=c.store_id and s.is_public=false
  left join public.products p on p.store_id=c.store_id and p.category_id=c.id
  group by c.id,c.store_id,c.name,c.is_published,s.display_name
  order by s.display_name,c.name,c.id
  limit 150
 ) q;
 return v_rows;
end $fn$;
revoke all on function public.set_admin_category_publication(
 uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_admin_category_publication_overview()
 from public,anon,authenticated;
grant execute on function public.set_admin_category_publication(
 uuid,uuid,text,text) to authenticated;
grant execute on function public.get_admin_category_publication_overview()
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.set_admin_category_publication(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('anon',
   'public.get_admin_category_publication_overview()','EXECUTE')
 or has_table_privilege('authenticated',
   'public.apex_category_publication_events','INSERT')
 or has_column_privilege('authenticated',
   'public.categories','is_published','UPDATE')
 or (select enabled from apex_internal.private_release_gate
     where singleton=true) is distinct from false
 then raise exception 'Admin category controls postflight denied';end if;
end $postflight$;
commit;
