-- Verify public projection, supplier tenant isolation, admin-only globals,
-- schedule behavior, optimistic concurrency and audit on isolated PostgreSQL.
set role anon;
select set_config('test.actor','',false);
select set_config('test.jwt','{}',false);
do $test$
begin
 if public.get_apex_public_notices()<>'[]'::jsonb then
  raise exception 'Unexpected public notices in empty fixture';end if;
 begin
  perform public.get_apex_manageable_notices(null);
  raise exception 'Expected unauthenticated denial';
 exception when others then
  if SQLERRM='Expected unauthenticated denial' then raise;end if;
 end;
end $test$;
reset role;

set role authenticated;
select set_config('test.actor','40000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"supplier"}}',false);
do $test$
declare v jsonb;v_id uuid;v_ts timestamptz;v_out jsonb;
begin
 v:=public.save_apex_storefront_notice(
  null,'10000000-0000-4000-8000-000000000001',
  'Free delivery notice','Shipping info available in catalog','/catalog',
  now()-interval '1 hour',now()+interval '1 day',true,5::smallint,null);
 v_id:=(v->>'id')::uuid;v_ts:=(v->>'updated_at')::timestamptz;
 if v_id is null then raise exception 'Supplier could not create notice';end if;
 v_out:=public.get_apex_manageable_notices('10000000-0000-4000-8000-000000000001');
 if jsonb_array_length(v_out)<>1 then
  raise exception 'Supplier notice missing from private listing';end if;
 if jsonb_array_length(public.get_apex_public_notices())<>1 then
  raise exception 'Supplier notice not shown publicly';end if;
 -- Optimistic concurrency rejects a stale write after first successful edit.
 perform public.save_apex_storefront_notice(v_id,
  '10000000-0000-4000-8000-000000000001',
  'Updated delivery notice','Shipping info available in catalog','/catalog',
  now()-interval '1 hour',now()+interval '1 day',true,4::smallint,v_ts);
 begin
  perform public.save_apex_storefront_notice(v_id,
   '10000000-0000-4000-8000-000000000001',
   'Stale delivery notice','','/catalog',
   null,null,true,3::smallint,v_ts);
  raise exception 'Expected stale write denial';
 exception when others then
  if SQLERRM='Expected stale write denial' then raise;end if;
 end;
 begin
  perform public.save_apex_storefront_notice(null,null,'Global notice','',null,
   null,null,true,0::smallint,null);
  raise exception 'Supplier created unauthorized global notice';
 exception when others then
  if SQLERRM='Supplier created unauthorized global notice' then raise;end if;
 end;
 begin
  perform public.save_apex_storefront_notice(
   null,'10000000-0000-4000-8000-000000000002',
   'Other supplier notice','',null,null,null,true,0::smallint,null);
  raise exception 'Supplier created cross-store notice';
 exception when others then
  if SQLERRM='Supplier created cross-store notice' then raise;end if;
 end;
end $test$;
reset role;

set role authenticated;
select set_config('test.actor','40000000-0000-4000-8000-000000000002',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"supplier"}}',false);
do $test$
declare v jsonb;v_id uuid;
begin
 begin
  perform public.get_apex_manageable_notices('10000000-0000-4000-8000-000000000001');
  raise exception 'Expected cross-tenant read denial';
 exception when others then
  if SQLERRM='Expected cross-tenant read denial' then raise;end if;
 end;
 -- No supplier reads or writes private actor metadata.
 v:=public.get_apex_manageable_notices('10000000-0000-4000-8000-000000000002');
 if jsonb_array_length(v)<>0 then raise exception 'Cross-tenant read leaked data';end if;
end $test$;
reset role;

set role authenticated;
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"platform_admin"}}',false);
do $test$
declare v jsonb;v_id uuid;
begin
 v:=public.save_apex_storefront_notice(null,null,
  'Platform announcement','New notice','/',
  now()-interval '10 minutes',now()+interval '1 day',true,10::smallint,null);
 v_id:=(v->>'id')::uuid;
 if jsonb_array_length(public.get_apex_public_notices())<>2 then
  raise exception 'Expected two active current notices';end if;
 if jsonb_array_length(public.get_apex_manageable_notices(null))<>2 then
  raise exception 'Admin did not see both notices';end if;
 -- Scheduled (future) and expired notices are not currently displayed by client.
 perform public.save_apex_storefront_notice(null,null,'Future campaign','',null,
  now()+interval '2 days',now()+interval '3 days',true,1::smallint,null);
 perform public.save_apex_storefront_notice(null,null,'Expired campaign','',null,
  now()-interval '2 days',now()-interval '1 day',true,1::smallint,null);
 if jsonb_array_length(public.get_apex_public_notices())<>3 then
  raise exception 'Expected active + future, never expired';end if;
 if (public.get_apex_public_notices()::text) like '%Expired campaign%' then
  raise exception 'Expired notice exposed publicly';end if;
end $test$;
reset role;

set role anon;
select set_config('test.actor','',false);
select set_config('test.jwt','{}',false);
do $test$
declare v jsonb;
begin
 v:=public.get_apex_public_notices();
 if v::text like '%created_by%' or v::text like '%updated_by%' or
    v::text like '%actor_id%' or v::text like '%store_id%' then
  raise exception 'Private fields leaked from public projection';end if;
end $test$;
reset role;
do $test$
begin
 if not (select relrowsecurity from pg_class
    where oid='apex_internal.apex_storefront_notices'::regclass) then
  raise exception 'Notice RLS disabled';end if;
 if not (select relrowsecurity from pg_class
    where oid='apex_internal.apex_storefront_notice_events'::regclass) then
  raise exception 'Audit RLS disabled';end if;
 if (select count(*) from apex_internal.apex_storefront_notice_events)<5 then
  raise exception 'Expected append-only audit events';end if;
end $test$;
