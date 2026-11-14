-- Disposable PostgreSQL identity checks. NO LOGIN and NO password.
do $$
begin
 if (select rolcanlogin from pg_roles where rolname='apex_retail_checkout_app') or
  (select rolsuper from pg_roles where rolname='apex_retail_checkout_app') or
  (select rolbypassrls from pg_roles where rolname='apex_retail_checkout_app') or
  (select rolinherit from pg_roles where rolname='apex_retail_checkout_app') or
  not pg_has_role('apex_retail_checkout_app',
    'apex_retail_checkout_executor','MEMBER') or
  pg_has_role('apex_retail_checkout_app',
    'apex_retail_checkout_executor','USAGE') or
  has_function_privilege('apex_retail_checkout_app',
    'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  has_table_privilege('apex_retail_checkout_app','public.products','SELECT') or
  has_table_privilege('apex_retail_checkout_app','apex_internal.retail_order_holds','SELECT') or
  has_table_privilege('apex_retail_checkout_app','public.inventory_items','UPDATE')
 then raise exception 'NOLOGIN app identity leaked private role privileges';end if;
end $$;

-- Ensure no direct checkout function is available before explicit SET ROLE.
set role apex_retail_checkout_app;
do $$
begin
 if has_function_privilege(current_user,
  'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE')
 then raise exception 'NOINHERIT app login gained direct checkout privilege';end if;
end $$;
reset role;

-- This is the exact role elevation issued by the Node transaction adapter.
-- Database role membership, not a browser request, authorizes SET LOCAL ROLE.
begin;
set local role apex_retail_checkout_app;
set local role apex_retail_checkout_executor;
do $$
begin
 if current_user<>'apex_retail_checkout_executor' or
  not has_function_privilege(current_user,
    'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  has_table_privilege(current_user,'apex_internal.retail_order_holds','SELECT') or
  has_table_privilege(current_user,'public.inventory_items','UPDATE')
 then raise exception 'SET LOCAL ROLE did not acquire only scoped execution';end if;
end $$;
rollback;

do $$
begin
 if current_user<>'postgres' or
   (select enabled from apex_internal.retail_order_engine_gate where singleton)
     is distinct from false
 then raise exception 'Role did not reset or production gate was enabled';end if;
end $$;
