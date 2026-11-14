-- Applied to Apex Supabase as migration 20261114234546.
-- Password intentionally NULL; set only by a secure credential flow.
create role apex_checkout_monitor_login
  login inherit password null nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
grant apex_checkout_monitor to apex_checkout_monitor_login with inherit true, set false;
alter role apex_checkout_monitor_login set statement_timeout='12s';
alter role apex_checkout_monitor_login set idle_in_transaction_session_timeout='15s';
alter role apex_checkout_monitor_login set default_transaction_read_only=on;
alter role apex_checkout_monitor_login set search_path=pg_catalog, apex_internal;
