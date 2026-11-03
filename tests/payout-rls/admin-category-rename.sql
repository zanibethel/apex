-- PR #186: disposable RLS tests for verified admin category rename.
\set ON_ERROR_STOP on
do $$
begin
 if has_function_privilege('anon',
  'public.rename_admin_catalog_category(uuid,uuid,text,text)','EXECUTE')
  or has_table_privilege('authenticated','public.categories','UPDATE')
  or has_table_privilege('authenticated',
   'public.apex_category_publication_events','INSERT')
 then raise exception 'Category rename privilege escalation';end if;
end $$;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
  perform public.rename_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001',
   '63000000-0000-0000-0000-000000000001',
   'Original','Untrusted');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous category renaming allowed';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $$
declare
 denied boolean:=false;
 cat uuid;
begin
 select id into cat from public.categories where
  store_id='62000000-0000-0000-0000-000000000001'
  and slug='research-supplies';
 begin
  perform public.rename_admin_catalog_category(
   '62000000-0000-0000-0000-000000000001',
   cat,'Research Supplies','Forged Rename');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier impersonated category rename';end if;
 denied:=false;
 begin
  update public.categories set name='Direct Update' where id=cat;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier edited category without RPC';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare
 store uuid:='62000000-0000-0000-0000-000000000001';
 cat uuid;
 other uuid;
 result jsonb;
 denied boolean;
 old_count int;
begin
 select id into cat from public.categories where
  store_id=store and slug='research-supplies';
 if cat is null then raise exception 'Expected category creation fixture';end if;
 result:=public.rename_admin_catalog_category(
  store,cat,'Research Supplies','Lab & Research');
 if result->>'status'<>'renamed' or
    result->>'category_id'<>cat::text or
    result->>'is_published'<>'false'
 then raise exception 'Rename readback mismatch';end if;
 if not exists(select 1 from public.categories
  where id=cat and store_id=store and name='Lab & Research'
  and slug='lab-research' and is_published=false)
 then raise exception 'Renamed category metadata incorrect';end if;
 if (select count(*) from public.apex_category_publication_events
  where category_id=cat and action='rename'
   and category_name='Lab & Research'
   and actor_id='00000000-0000-0000-0000-000000000001'
   and reason like 'Renamed from Research Supplies to Lab%')<>1
 then raise exception 'Category rename audit missing';end if;

 select count(*) into old_count from public.apex_category_publication_events
  where category_id=cat and action='rename';
 result:=public.rename_admin_catalog_category(
  store,cat,'Lab & Research','Lab & Research');
 if result->>'status'<>'unchanged' or
   (select count(*) from public.apex_category_publication_events
    where category_id=cat and action='rename')<>old_count
 then raise exception 'No-op rename created audit';end if;

 denied:=false;
 begin
  perform public.rename_admin_catalog_category(
   store,cat,'Research Supplies','New Label');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Stale category rename accepted';end if;

 other:=(public.create_admin_catalog_category(store,'Already Named')->>'category_id')::uuid;
 denied:=false;
 begin
  perform public.rename_admin_catalog_category(
   store,cat,'Lab & Research','Already Named');
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate category slug accepted';end if;
 denied:=false;
 begin
  perform public.rename_admin_catalog_category(
   store,cat,'Lab & Research','Unsafe;Name');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Invalid category name accepted';end if;
 denied:=false;
 begin
  perform public.rename_admin_catalog_category(
   '00000000-0000-0000-0000-000000000002',cat,
   'Lab & Research','Cross Store');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cross-store rename allowed';end if;

 perform public.set_admin_category_publication(
  store,other,'publish','Verified test category');
 denied:=false;
 begin
  perform public.rename_admin_catalog_category(
   store,other,'Already Named','Published Rename');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Published category rename allowed';end if;
 if not exists(select 1 from public.categories
  where id=other and name='Already Named' and is_published)
 then raise exception 'Published category altered';end if;
 perform public.set_admin_category_publication(
  store,other,'unpublish','Return to private test state');
end $$;
rollback;
-- Inspect the private release-gate table only as the fixture's postgres
-- operator, not as an authenticated storefront user.
do $$
begin
 if (select enabled from apex_internal.private_release_gate where singleton=true)
    is distinct from false
 then raise exception 'Category rename enabled public gallery';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Category rename exposed public products';end if;
end $$;
select 'PASS: category rename identity, audit, stale/duplicate denial and publication isolation';
