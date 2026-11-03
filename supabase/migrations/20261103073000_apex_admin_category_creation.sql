-- PR #180: add private category creation to existing verified admin controls.
-- Never seeds product categories, marks any category public, updates a product,
-- enables site release, or accepts payments. Installation is metadata-only.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.categories') is null
  or to_regclass('public.apex_category_publication_events') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or to_regprocedure('public.set_admin_category_publication(uuid,uuid,text,text)') is null
  or not exists(select 1 from apex_internal.private_release_gate
    where singleton=true and enabled=false)
  or has_table_privilege('authenticated','public.categories','INSERT')
  or has_table_privilege('anon','public.categories','INSERT')
  or has_table_privilege('authenticated',
    'public.apex_category_publication_events','INSERT')
 then raise exception 'Category create preflight denied';end if;
end $preflight$;

-- Extend the existing append-only publication audit to include creation.
-- Existing publication/unpublication events retain their original meaning.
alter table public.apex_category_publication_events
 drop constraint apex_category_publication_events_action_check;
alter table public.apex_category_publication_events
 add constraint apex_category_publication_events_action_check
 check(action in ('create','publish','unpublish'));

create function public.create_admin_catalog_category(
 p_store_id uuid,p_name text
) returns jsonb language plpgsql security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_name text;
 v_slug text;
 v_id uuid;
begin
 if v_actor is null or (select auth.jwt())
    #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 -- Reject excessive or ambiguous names; never trust a submitted slug.
 if p_name is null or length(p_name)>90 then
  raise exception 'Enter a valid category name' using errcode='22023';end if;
 v_name:=regexp_replace(btrim(p_name),'[[:space:]]+',' ','g');
 if length(v_name)<2 or length(v_name)>60
  or v_name !~ '^[A-Za-z0-9][A-Za-z0-9 &+/_-]*$'
 then raise exception 'Enter a valid category name' using errcode='22023';end if;
 v_slug:=btrim(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),'-');
 if length(v_slug)<2 or length(v_slug)>60
 then raise exception 'Invalid category slug' using errcode='22023';end if;
 -- Lock the specific private store to serialize concurrent category creates
 -- and enforce the store's category count limit consistently.
 perform 1 from public.stores s where s.id=p_store_id
  and s.is_public=false for update;
 if not found then raise exception 'Private storefront unavailable'
   using errcode='42501';end if;

 -- The underlying unique(store_id,slug) constraint protects concurrent
 -- creates. A bounded store count protects the admin overview's page size.
 if (select count(*) from public.categories c where c.store_id=p_store_id)>=150
 then raise exception 'Store category limit reached' using errcode='22023';end if;
 insert into public.categories(store_id,slug,name,is_published)
 values(p_store_id,v_slug,v_name,false)
 on conflict(store_id,slug) do nothing returning id into v_id;
 if v_id is null then
  raise exception 'Category already exists' using errcode='23505';end if;
 insert into public.apex_category_publication_events(
  store_id,category_id,category_name,action,reason,actor_id)
 values(p_store_id,v_id,v_name,'create','Category created unpublished',v_actor);
 return jsonb_build_object(
  'status','created','category_id',v_id,'is_published',false
 );
end $fn$;

-- A new store may have no categories; expose its name and ID to verified
-- admins only, with no supplier secrets or general table read expansion.
create function public.get_admin_private_category_stores()
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if (select auth.uid()) is null or (select auth.jwt())
  #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'name',s.display_name
 ) order by s.display_name,s.id),'[]'::jsonb)
 into v_result from (
  select id,display_name from public.stores
  where is_public=false
  order by display_name,id limit 100
 ) s;
 return v_result;
end $fn$;

revoke all on function public.create_admin_catalog_category(uuid,text)
 from public,anon,authenticated;
revoke all on function public.get_admin_private_category_stores()
 from public,anon,authenticated;
grant execute on function public.create_admin_catalog_category(uuid,text)
 to authenticated;
grant execute on function public.get_admin_private_category_stores()
 to authenticated;
do $postflight$
begin
 if has_function_privilege('anon',
   'public.create_admin_catalog_category(uuid,text)','EXECUTE')
  or has_function_privilege('anon',
   'public.get_admin_private_category_stores()','EXECUTE')
  or has_table_privilege('authenticated','public.categories','INSERT')
  or has_table_privilege('authenticated',
   'public.apex_category_publication_events','INSERT')
  or (select enabled from apex_internal.private_release_gate
      where singleton=true) is distinct from false
 then raise exception 'Category create postflight denied';end if;
end $postflight$;
commit;
