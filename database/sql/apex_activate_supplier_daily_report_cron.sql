-- Production activation for PR #210. Run after verified foundation migration.
-- Daily 12:00 UTC = 7:00 AM CDT or 6:00 AM CST in America/Chicago:
-- generated before the supplier's 8 AM Central deadline through DST.
-- A database job writes private summary snapshots; it does not send mail.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regprocedure('apex_internal.refresh_supplier_daily_order_reports()') is null
 or to_regclass('apex_internal.supplier_daily_order_reports') is null
 or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Daily-report cron activation preflight denied';end if;
end $preflight$;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('apex_supplier_daily_orders_0800_central',
 '0 12 * * *',
 'select apex_internal.refresh_supplier_daily_order_reports();');
commit;
