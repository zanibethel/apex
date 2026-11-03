-- PR #186: audited private category rename. Preserve category IDs, product
-- assignments and all publication gates. Requires verified admin identity.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.categories') is null
  or to_regclass('public.apex_category_publication_events') is null
  or to_regprocedure('public.create_admin_catalog_category(uuid,text)') is null
  or to_regprocedure('apex_internal.invalidate_private_review(uuid,uuid,text)') is null
  or has_table_privilege('authenticated','public.categories','UPDATE')
  or has_table_privilege('anon','public.categories','UPDATE')
  or has_table_privilege('authenticated','public.apex_category_publication_events','INSERT')
 then raise exception 'Rename preflight denied'; end if;
end $preflight$;

alter table public.apex_category_publication_events
 drop constraint apex_category_publication_events_action_check;
alter table public.apex_category_publication_events
 add constraint apex_category_publication_events_action_check
 check(action in ('create','publish','unpublish','rename'));

create function public.rename_admin_catalog_category(
 p_store_id uuid,p_category_id uuid,p_expected_name text,p_new_name text
) returns jsonb language plpgsql security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_category public.categories%rowtype;
 v_name text;
 v_slug text;
 v_product record;
begin
 if v_actor is null or (select auth.jwt())
  #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required'
  using errcode='42501';end if;
 if p_new_name is null or length(p_new_name)>90
  or p_expected_name is null or length(p_expected_name)>90
 then raise exception 'Invalid category rename request'
  using errcode='22023';end if;
 v_name:=regexp_replace(btrim(p_new_name),'[[:space:]]+',' ','g');
 if length(v_name)<2 or length(v_name)>60
  or v_name !~ '^[A-Za-z0-9][A-Za-z0-9 &+/_-]*$'
 then raise exception 'Enter a valid category name'
  using errcode='22023';end if;
 v_slug:=btrim(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),'-');
 if length(v_slug)<2 or length(v_slug)>60
 then raise exception 'Invalid category slug' using errcode='22023';end if;

 if not exists(select 1 from public.stores s
  where s.id=p_store_id and s.is_public=false)
 then raise exception 'Private storefront required' using errcode='42501';end if;
 select * into v_category from public.categories c
  where c.id=p_category_id and c.store_id=p_store_id for update;
 if not found then raise exception 'Category does not belong to storefront'
  using errcode='42501';end if;
 if v_category.name is distinct from p_expected_name
 then raise exception 'Category changed. Refresh and retry.'
  using errcode='22023';end if;
 -- No renames after a category has been approved for public presentation.
 -- Unpublish explicitly first so the independent public catalog gate stays safe.
 if v_category.is_published then raise exception
   'Unpublish this category before renaming' using errcode='23514';end if;
 if v_category.name=v_name
 then return jsonb_build_object('status','unchanged',
  'category_id',v_category.id,'name',v_name,'is_published',false);end if;

 update public.categories set name=v_name,slug=v_slug
  where id=p_category_id and store_id=p_store_id and is_published=false;
 insert into public.apex_category_publication_events
  (store_id,category_id,category_name,action,reason,actor_id)
 values(p_store_id,p_category_id,v_name,'rename',
   'Renamed from '||v_category.name||' to '||v_name,v_actor);

 -- A taxonomy label change can invalidate a previous internal assessment.
 -- Preserve all products/stock/publication metadata but revoke stale
 -- pending/approved internal reviews using the existing audited function.
 for v_product in select p.id from public.products p
  where p.store_id=p_store_id and p.category_id=p_category_id
 loop
  perform apex_internal.invalidate_private_review(
   p_store_id,v_product.id,'product');
 end loop;
 return jsonb_build_object('status','renamed',
  'category_id',p_category_id,'name',v_name,'is_published',false);
end $fn$;

revoke all on function public.rename_admin_catalog_category(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.rename_admin_catalog_category(uuid,uuid,text,text)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.rename_admin_catalog_category(uuid,uuid,text,text)','EXECUTE')
  or has_table_privilege('authenticated','public.categories','UPDATE')
  or has_table_privilege('authenticated',
    'public.apex_category_publication_events','INSERT')
 then raise exception 'Category rename privileges unsafe';end if;
end $postflight$;
commit;
