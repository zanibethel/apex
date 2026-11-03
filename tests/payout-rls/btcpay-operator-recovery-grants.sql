-- PR #174: role and network-independent authorization checks.
\set ON_ERROR_STOP on
do $$
declare v_role record; v_name text;
begin
 for v_role in select * from pg_catalog.pg_roles
   where rolname in ('apex_test_recovery_requester',
                     'apex_test_recovery_reviewer')
 loop
   if not v_role.rolcanlogin or v_role.rolinherit or v_role.rolsuper
     or v_role.rolcreatedb or v_role.rolcreaterole or
     v_role.rolreplication or v_role.rolbypassrls then
       raise exception 'Recovery operator is privileged or cannot authenticate';
   end if;
 end loop;
 if (select count(*) from pg_catalog.pg_roles where rolname in (
  'apex_test_recovery_requester','apex_test_recovery_reviewer'))<>2 then
    raise exception 'Two independent operator login roles required';
 end if;
 foreach v_name in array array[
    'apex_test_recovery_requester','apex_test_recovery_reviewer',
    'apex_test_invoice_worker','anon','authenticated'
 ] loop
   if has_table_privilege(v_name,
     'public.btcpay_test_operator_recovery_requests','INSERT') or
      has_table_privilege(v_name,
     'public.btcpay_test_operator_recovery_approvals','INSERT') or
      has_table_privilege(v_name,
     'public.btcpay_test_provider_post_observations','INSERT') or
      has_table_privilege(v_name,
     'public.btcpay_test_worker_observation_caps','SELECT') then
    raise exception '% can bypass append-only operator recovery',v_name;
   end if;
 end loop;
 if not has_function_privilege('apex_test_recovery_requester',
    'apex_test_recovery.request_verified_provider_readback(uuid,text,text)','EXECUTE')
 or not has_function_privilege('apex_test_recovery_reviewer',
    'apex_test_recovery.approve_verified_provider_readback(uuid,text)','EXECUTE')
 or has_function_privilege('apex_test_recovery_requester',
    'apex_test_recovery.approve_verified_provider_readback(uuid,text)','EXECUTE')
 or has_function_privilege('apex_test_recovery_reviewer',
    'apex_test_recovery.request_verified_provider_readback(uuid,text,text)','EXECUTE')
 or has_schema_privilege('authenticated','apex_test_recovery','USAGE')
 or has_schema_privilege('apex_test_invoice_worker','apex_test_recovery','USAGE')
 or has_function_privilege('apex_test_invoice_worker',
    'apex_test_worker.worker_observe_btcpay_test_provider_post(uuid,text,text)','EXECUTE') then
   raise exception 'Recovery RPC roles not separated';
 end if;
end $$;
-- SET ROLE cannot spoof session_user: a superuser connection still
-- authenticates as postgres. This must fail even if SET ROLE is allowed.
begin;
set local role apex_test_recovery_requester;
do $$
declare denied boolean:=false;
begin
 begin
   perform apex_test_recovery.request_verified_provider_readback(
    '00000000-0000-0000-0000-000000000000','fake-invoice',repeat('a',64));
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'SET ROLE bypassed real operator login'; end if;
end $$;
rollback;
select 'recovery_permissions_verified';
