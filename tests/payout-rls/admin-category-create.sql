-- PR #180: category creation in disposable Postgres only.
\set ON_ERROR_STOP on
do $$
begin
 if has_function_privilege('anon',
      'public.create_admin_catalog_category(uuid,text)','EXECUTE')
 or has_function_privilege('anon',
      'public.get_admin_private_category_stores()','EXECUTE')
 or has_table_privilege('authenticated','public.categories','INSERT')
 or has_table_privilege('authenticated',
      'public.apex_category_publication_events','INSERT')
 or (select enabled from apex_internal.private_release_gate where singleton=true)
     is distinct from false
 then raise exception 'Category creation privileges or release gate unsafe';end if;
end $$;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
  perform public.create_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001','Untrusted');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous create was allowed';end if;
 denied:=false;
 begin perform public.get_admin_private_category_stores();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous store inventory was exposed';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $$
declare denied boolean:=false;
begin
 begin
  perform public.create_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001','Forged');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier impersonated category creator';end if;
 denied:=false;
 begin perform public.get_admin_private_category_stores();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Non-admin exposed private store inventory';end if;
 denied:=false;
 begin
  insert into public.categories(store_id,slug,name,is_published)
   values('62000000-0000-0000-0000-000000000001','direct-write','Unsafe',true);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier wrote category directly';end if;
 denied:=false;
 begin
  insert into public.apex_category_publication_events(
    store_id,category_id,category_name,action,actor_id)
   values('62000000-0000-0000-0000-000000000001',
     '63000000-0000-0000-0000-000000000001','Forged','create',
     '00000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier wrote private audit event';end if;
end $$;
rollback;

-- An authenticated admin creates a new, unlisted category once.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare
 result jsonb;
 cat uuid;
 stores jsonb;
 denied boolean;
begin
 stores:=public.get_admin_private_category_stores();
 if jsonb_array_length(stores)<1 or not exists(
  select 1 from jsonb_array_elements(stores) entry
  where entry->>'id'='62000000-0000-0000-0000-000000000001'
   and entry ? 'name' and
    (select count(*) from jsonb_object_keys(entry))=2
 ) then raise exception 'Store chooser missing authorized private store';end if;

 result:=public.create_admin_catalog_category(
  '62000000-0000-0000-0000-000000000001','Research   Supplies');
 cat:=(result->>'category_id')::uuid;
 if result->>'status'<>'created' or result->>'is_published'<>'false'
  or cat is null then raise exception 'Creation was not confirmed unpublished';end if;
 if not exists(select 1 from public.categories
  where id=cat and store_id='62000000-0000-0000-0000-000000000001'
   and slug='research-supplies' and name='Research Supplies'
   and is_published=false)
 then raise exception 'Created category metadata incorrect';end if;

 denied:=false;
 begin
  perform public.create_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001','Research Supplies');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate slug category allowed';end if;
 denied:=false;
 begin
  perform public.create_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001','Research/Supplies');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Alternate spelling duplicate slug allowed';end if;
 denied:=false;
 begin
  perform public.create_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001',';DROP TABLE');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Untrusted category title accepted';end if;
 denied:=false;
 begin
  perform public.create_admin_catalog_category(
   '00000000-0000-0000-0000-000000000002','Wrong Store');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store category create allowed';end if;
 if (select count(*) from public.apex_category_publication_events
  where category_id=cat and action='create'
    and actor_id='00000000-0000-0000-0000-000000000001'
    and category_name='Research Supplies')<>1
 then raise exception 'Category creation was not audited exactly once';end if;
end $$;
commit;

do $$
begin
 if (select count(*) from public.categories
  where store_id='62000000-0000-0000-0000-000000000001'
   and slug='research-supplies' and is_published=false)<>1
 then raise exception 'New category missing or automatically published';end if;
 if (select enabled from apex_internal.private_release_gate where singleton=true)
    is distinct from false
 then raise exception 'Category create enabled public release';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Category create exposed the public catalog';end if;
 if (select count(*) from public.products
   where id='64000000-0000-0000-0000-000000000001'
     and category_id<>'63000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Category create reassigned an existing product';end if;
end $$;
select 'PASS: private category creation, identity, duplicate denial and audit';
