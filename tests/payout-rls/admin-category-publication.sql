-- PR #178: disposable PostgreSQL checks, no hosted category changes.
\set ON_ERROR_STOP on
do $$
begin
 if (select enabled from apex_internal.private_release_gate where singleton=true)
  is distinct from false then raise exception 'Category migration enabled release';end if;
 if not has_function_privilege('authenticated',
    'public.set_admin_category_publication(uuid,uuid,text,text)','EXECUTE')
  or has_function_privilege('anon',
    'public.set_admin_category_publication(uuid,uuid,text,text)','EXECUTE')
  or has_function_privilege('anon',
    'public.get_admin_category_publication_overview()','EXECUTE')
  or has_table_privilege('authenticated',
    'public.apex_category_publication_events','INSERT')
  or has_column_privilege('authenticated',
    'public.categories','is_published','UPDATE')
 then raise exception 'Category grants violate admin-only controls';end if;
end $$;

-- Public and supplier roles must not change public category flags directly.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $$
declare denied boolean:=false;
begin
 begin
  perform public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'unpublish','');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier forged category unpublish';end if;
 denied:=false;
 begin
  update public.categories set is_published=false
    where id='63000000-0000-0000-0000-000000000001';
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier wrote protected category flag';end if;
 denied:=false;
 begin
  insert into public.apex_category_publication_events(
    store_id,category_id,category_name,action,actor_id)
  values('62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'Forged','unpublish','00000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier forged category audit';end if;
end $$;
rollback;

-- Neither a self-edited user_metadata role nor a missing role is trusted.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"}}';
do $$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_category_publication_overview();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'User metadata role bypassed admin';end if;
end $$;
rollback;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
  perform public.get_admin_category_publication_overview();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous access to private categories';end if;
end $$;
rollback;

-- Authenticated platform administrator can read private category summary,
-- change category state and leave an immutable, identity-bound audit.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare
 v jsonb;
 v_result text;
 denied boolean:=false;
begin
 v:=public.get_admin_category_publication_overview();
 if jsonb_typeof(v)<>'array' or not exists(
   select 1 from jsonb_array_elements(v) as row
    where row->>'category_id'='63000000-0000-0000-0000-000000000001'
     and row->>'store_id'='62000000-0000-0000-0000-000000000001'
     and row->>'category_name'='Synthetic category'
     and row ? 'product_count'
     and (select count(*) from jsonb_object_keys(row))=7
 ) then raise exception 'Admin readback missing private category';end if;
 v_result:=public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'unpublish','');
 if v_result<>'Category hidden from public gallery'
 then raise exception 'Admin unpublish failed';end if;
 if (select is_published from public.categories
     where id='63000000-0000-0000-0000-000000000001')<>false
 then raise exception 'Category not unpublished';end if;
 v_result:=public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'publish','Category metadata reviewed for the catalog');
 if v_result not like 'Category enabled;%'
 then raise exception 'Admin category publish failed';end if;
 if not (select is_published from public.categories
    where id='63000000-0000-0000-0000-000000000001')
 then raise exception 'Category was not enabled';end if;
 -- Repeated same-state calls are idempotent and do not forge more audits.
 perform public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'publish','Another publication check');
 denied:=false;
 begin
  perform public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'publish','');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Missing audit reason accepted';end if;
 denied:=false;
 begin
  perform public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'activate','Attempt to enable commerce');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Unknown admin action accepted';end if;
 denied:=false;
 begin
  perform public.set_admin_category_publication(
    '62000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'publish','Wrong store category');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store category bypass';end if;
end $$;
rollback;

-- Re-run committed actions as genuine admin to validate append-only audit
-- and ensure global release remains disabled throughout.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
select public.set_admin_category_publication(
 '62000000-0000-0000-0000-000000000001',
 '63000000-0000-0000-0000-000000000001',
 'unpublish','');
select public.set_admin_category_publication(
 '62000000-0000-0000-0000-000000000001',
 '63000000-0000-0000-0000-000000000001',
 'publish','Category reviewed for catalog grouping');
commit;
do $$
begin
 if (select count(*) from public.apex_category_publication_events
  where category_id='63000000-0000-0000-0000-000000000001'
    and actor_id='00000000-0000-0000-0000-000000000001')<>2
 then raise exception 'Category publication audit incomplete or duplicated';end if;
 if (select enabled from apex_internal.private_release_gate where singleton=true)
 is distinct from false then raise exception 'Category controls opened release gate';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Category action exposed public products without approval';end if;
 if (select count(*) from public.products where is_published=true
   and id='64000000-0000-0000-0000-000000000001')<>0
 then raise exception 'Category control changed private base product flags';end if;
end $$;
select 'PASS: category publication actions guarded, audited and checkout held';
