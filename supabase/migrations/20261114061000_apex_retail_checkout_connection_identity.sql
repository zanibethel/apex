-- Dedicated application login identity: NOLOGIN until a controlled,
-- secret-managed provisioning step. Do not store a password in Git.
-- Membership can be activated by SET LOCAL ROLE in one transaction, and
-- grants no default table access or Supabase Data API privileges.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if exists(select 1 from pg_roles where rolname='apex_retail_checkout_app')
    or not exists(select 1 from pg_roles where
      rolname='apex_retail_checkout_executor' and rolcanlogin=false
      and rolsuper=false and rolbypassrls=false)
    or (select enabled from apex_internal.retail_order_engine_gate where singleton)
      is distinct from false
    or exists(select 1 from apex_internal.retail_order_holds
      where state='held_no_payment')
 then raise exception 'App login identity preflight denied';end if;
end $preflight$;

create role apex_retail_checkout_app
 NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
grant apex_retail_checkout_executor to apex_retail_checkout_app
 with inherit false, set true;

-- These roles are not Data API clients, are not the Supabase service role,
-- and must never inherit private table privileges by default.
revoke all on schema apex_internal from apex_retail_checkout_app;
revoke all on schema public from apex_retail_checkout_app;
grant usage on schema public to apex_retail_checkout_app;

do $postflight$
begin
 if not exists(
  select 1 from pg_roles r where r.rolname='apex_retail_checkout_app'
   and not r.rolcanlogin and not r.rolinherit and not r.rolsuper
   and not r.rolbypassrls and r.rolconnlimit=3)
 or not pg_has_role('apex_retail_checkout_app',
   'apex_retail_checkout_executor','MEMBER')
 or pg_has_role('apex_retail_checkout_app',
   'apex_retail_checkout_executor','USAGE')
 or has_table_privilege('apex_retail_checkout_app',
  'apex_internal.retail_order_holds','SELECT')
 or has_table_privilege('apex_retail_checkout_app',
  'public.inventory_items','UPDATE')
 or has_function_privilege('apex_retail_checkout_app',
  'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE')
 or (select enabled from apex_internal.retail_order_engine_gate where singleton)
  is distinct from false
 then raise exception 'App login identity was granted excessive privileges';end if;
end $postflight$;
commit;
