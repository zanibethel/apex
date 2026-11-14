-- Default-locked, least-privilege private checkout execution capability.
-- This is a NOLOGIN role. DO NOT grant it to anon/authenticated/service_role,
-- do not give it direct data access, and do not store database passwords here.
-- Future checkout process requires independently provisioned, secret-managed
-- login and strict session-bound admission before any production gate change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if exists(select 1 from pg_roles where rolname='apex_retail_checkout_executor') or
  to_regprocedure('apex_internal.reserve_retail_order_hold(uuid,uuid,text,jsonb,text,text,bigint)') is null or
  to_regprocedure('apex_internal.attach_retail_delivery_envelope(uuid,uuid,text,bytea,bytea,bytea)') is null or
  to_regprocedure('apex_internal.get_retail_order_hold_receipt(uuid,uuid)') is null or
  to_regprocedure('public.get_public_retail_cart_quote_source(jsonb,text)') is null or
  (select enabled from apex_internal.retail_order_engine_gate where singleton)
   is distinct from false or
  exists(select 1 from apex_internal.retail_order_holds where state='held_no_payment')
 then raise exception 'Private checkout executor cannot be provisioned with active or missing prerequisites';end if;
end $preflight$;

-- At COMMIT a deferred constraint trigger runs in the caller's context.
-- Keep the worker unable to SELECT encrypted delivery directly; run only
-- this fixed-purpose existence check as the owner. The trigger has no
-- caller-supplied SQL, and its function remains non-executable by API roles.
alter function apex_internal.require_retail_delivery_at_commit()
 security definer;
alter function apex_internal.require_retail_delivery_at_commit()
 set search_path=pg_catalog;
revoke all on function apex_internal.require_retail_delivery_at_commit()
 from public,anon,authenticated,service_role;

create role apex_retail_checkout_executor
 NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
grant usage on schema apex_internal to apex_retail_checkout_executor;
grant usage on schema public to apex_retail_checkout_executor;
-- The existing public quote is a sanitized, read-only SECURITY DEFINER
-- source. It discloses no customer information and cannot reserve stock.
grant execute on function public.get_public_retail_cart_quote_source(jsonb,text)
 to apex_retail_checkout_executor;

-- Each wrapper runs one verified internal operation as the privileged owner,
-- with static SQL and exact typed parameters. This avoids broad SELECT/INSERT/
-- UPDATE grants and RLS bypass for the unprivileged client login role.
-- No wrapper changes the order-engine gate or authorizes payment/fulfillment.
create function apex_internal.checkout_worker_reserve_retail_hold(
 p_store_id uuid,p_request_id uuid,p_request_fingerprint text,
 p_items jsonb,p_code text,p_box_size text,p_expected_total_cents bigint
) returns jsonb language sql volatile security definer
 set search_path=pg_catalog as $fn$
 select apex_internal.reserve_retail_order_hold($1,$2,$3,$4,$5,$6,$7);
$fn$;

create function apex_internal.checkout_worker_attach_retail_delivery(
 p_store_id uuid,p_order_id uuid,p_key_reference text,
 p_nonce bytea,p_ciphertext bytea,p_auth_tag bytea
) returns jsonb language sql volatile security definer
 set search_path=pg_catalog as $fn$
 select apex_internal.attach_retail_delivery_envelope($1,$2,$3,$4,$5,$6);
$fn$;

create function apex_internal.checkout_worker_get_retail_receipt(
 p_store_id uuid,p_order_id uuid
) returns jsonb language sql stable security definer
 set search_path=pg_catalog as $fn$
 select apex_internal.get_retail_order_hold_receipt($1,$2);
$fn$;

revoke all on function apex_internal.checkout_worker_reserve_retail_hold(
 uuid,uuid,text,jsonb,text,text,bigint) from public,anon,authenticated,service_role;
revoke all on function apex_internal.checkout_worker_attach_retail_delivery(
 uuid,uuid,text,bytea,bytea,bytea) from public,anon,authenticated,service_role;
revoke all on function apex_internal.checkout_worker_get_retail_receipt(
 uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function apex_internal.checkout_worker_reserve_retail_hold(
 uuid,uuid,text,jsonb,text,text,bigint) to apex_retail_checkout_executor;
grant execute on function apex_internal.checkout_worker_attach_retail_delivery(
 uuid,uuid,text,bytea,bytea,bytea) to apex_retail_checkout_executor;
grant execute on function apex_internal.checkout_worker_get_retail_receipt(
 uuid,uuid) to apex_retail_checkout_executor;

-- Explicitly revoke default grants if the project has a custom default ACL.
-- No direct grant on products, inventory, promotions, checkout state or PII.
do $postflight$
declare v_role pg_roles%rowtype;
begin
 select * into v_role from pg_roles where rolname='apex_retail_checkout_executor';
 if not found or v_role.rolcanlogin or v_role.rolsuper or v_role.rolbypassrls or
  v_role.rolcreaterole or v_role.rolcreatedb or v_role.rolinherit
 then raise exception 'Checkout executor role is not adequately restricted';end if;
 if has_table_privilege('apex_retail_checkout_executor',
   'public.inventory_items','UPDATE') or
  has_table_privilege('apex_retail_checkout_executor',
   'public.products','SELECT') or
  has_table_privilege('apex_retail_checkout_executor',
   'apex_internal.retail_order_holds','INSERT') or
  has_table_privilege('apex_retail_checkout_executor',
   'apex_internal.retail_order_delivery_envelopes','SELECT') or
  has_function_privilege('anon','apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)','EXECUTE') or
  has_function_privilege('service_role','apex_internal.checkout_worker_attach_retail_delivery(uuid,uuid,text,bytea,bytea,bytea)','EXECUTE') or
  (select enabled from apex_internal.retail_order_engine_gate where singleton)
   is distinct from false
 then raise exception 'Checkout executor grants or default-off gate failed';end if;
end $postflight$;
commit;
