-- PR #172: inspect effective grants and exercise the restricted, separate
-- disposable PostgreSQL login, never a Supabase hosted database.
\set ON_ERROR_STOP on
do $$
declare
 v_role pg_catalog.pg_roles%rowtype;
 v_name text;
begin
 select * into v_role from pg_catalog.pg_roles
   where rolname='apex_test_invoice_worker';
 if not found or not v_role.rolcanlogin or v_role.rolsuper or
   v_role.rolinherit or v_role.rolcreatedb or v_role.rolcreaterole or
   v_role.rolreplication or v_role.rolbypassrls then
   raise exception 'Worker role is missing or has excessive privileges';
 end if;
 if exists(select 1 from pg_catalog.pg_auth_members m
   join pg_catalog.pg_roles r on r.oid=m.member
   where r.rolname='apex_test_invoice_worker') then
   raise exception 'Worker may inherit a higher privilege membership';
 end if;
 foreach v_name in array array[
   'public.btcpay_test_provider_post_intents',
   'public.btcpay_test_provider_post_observations',
   'public.btcpay_test_checkout_resume_permits',
   'public.btcpay_test_split_sync_holds',
   'public.btcpay_test_release_requests',
   'public.btcpay_test_release_approvals',
   'public.btcpay_test_sync_recovery_events',
   'public.btcpay_test_trusted_post_store_bindings',
   'public.btcpay_test_invoices',
   'public.payout_rules',
   'public.payout_rule_allocations',
   'public.stores'
 ] loop
   if has_table_privilege('apex_test_invoice_worker',v_name,'SELECT') or
      has_table_privilege('apex_test_invoice_worker',v_name,'INSERT') or
      has_table_privilege('apex_test_invoice_worker',v_name,'UPDATE') or
      has_table_privilege('apex_test_invoice_worker',v_name,'DELETE') then
      raise exception 'Worker has direct access to %',v_name;
   end if;
 end loop;
 if has_schema_privilege('apex_test_invoice_worker',
     'apex_test_internal','USAGE') or
    not has_schema_privilege('apex_test_invoice_worker',
     'apex_test_worker','USAGE') then
   raise exception 'Worker must see only its dedicated private RPC schema';
 end if;
 if not has_function_privilege('apex_test_invoice_worker',
     'apex_test_worker.worker_reserve_btcpay_test_provider_post(uuid,text,text,bigint)','EXECUTE') or
    not has_function_privilege('apex_test_invoice_worker',
     'apex_test_worker.worker_verify_btcpay_test_provider_post(uuid,uuid)','EXECUTE') or
    not has_function_privilege('apex_test_invoice_worker',
     'apex_test_worker.worker_observe_btcpay_test_provider_post(uuid,text,text)','EXECUTE') then
    raise exception 'Worker does not have its three restricted operations';
 end if;
 if has_function_privilege('apex_test_invoice_worker',
   'apex_test_internal.reserve_btcpay_test_provider_post(uuid,text,text,bigint)','EXECUTE') or
   has_function_privilege('apex_test_invoice_worker',
   'apex_test_internal.observe_btcpay_test_provider_post(uuid,text,text)','EXECUTE') or
   has_function_privilege('apex_test_invoice_worker',
   'apex_test_internal.open_btcpay_test_checkout_resume(uuid)','EXECUTE') then
    raise exception 'Worker can call unrestricted operator operation';
 end if;
 if has_function_privilege('anon',
   'apex_test_worker.worker_reserve_btcpay_test_provider_post(uuid,text,text,bigint)','EXECUTE') or
   has_function_privilege('authenticated',
   'apex_test_worker.worker_reserve_btcpay_test_provider_post(uuid,text,text,bigint)','EXECUTE') or
   has_function_privilege('authenticated',
   'apex_test_worker.worker_observe_btcpay_test_provider_post(uuid,text,text)','EXECUTE') then
    raise exception 'Untrusted browser role can call payment worker';
 end if;
end $$;

-- Use an actual SET ROLE to prove a SQL statement is rejected at the DB
-- privilege check. A failing statement must not be confused with no rows.
begin;
set local role apex_test_invoice_worker;
do $$
declare denied boolean:=false;
begin
 begin
   perform count(*) from public.btcpay_test_provider_post_intents;
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then
   raise exception 'Worker read payment intent table directly';
 end if;
 denied:=false;
 begin
   update public.payout_rules set status='active' where false;
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then
   raise exception 'Worker may mutate payout rule table';
 end if;
 denied:=false;
 begin
   insert into public.btcpay_test_provider_post_observations(
     intent_id,kind) values(
       '00000000-0000-0000-0000-000000000000','post_outcome_unknown');
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then
   raise exception 'Worker can bypass observation function';
 end if;
end $$;
rollback;
select 'restricted_worker_privileges_verified';
