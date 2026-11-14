-- Two independent, locked-down nonpayable retail admission prerequisites.
-- The public checkout endpoint and private order engine remain OFF.
-- No buyer PII, recipient details, IP addresses or product restrictions stored.
-- Applied only after disposable Postgres/RLS tests pass.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if to_regrole('apex_retail_checkout_executor') is null or
    to_regrole('apex_retail_checkout_app') is null or
    to_regprocedure('public.get_public_retail_cart_quote_source(jsonb,text)') is null or
    to_regclass('apex_internal.retail_order_engine_gate') is null or
    (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
       is distinct from false or
    exists(select 1 from apex_internal.retail_order_holds where state='held_no_payment') or
    to_regclass('apex_internal.retail_admission_budgets_v1') is not null or
    to_regprocedure('apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)') is not null or
    to_regprocedure('apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)') is not null
 then raise exception 'Retail admission guard prerequisites not met';end if;
end $preflight$;

-- Exactly one rolling 10-minute counter per subject: bounded storage over
-- time and atomic row-level serialization across Vercel instances.
-- Subject UUID comes exclusively from the server-verified Supabase getUser().
create table apex_internal.retail_admission_budgets_v1(
 subject_id uuid primary key,
 operation text not null default 'nonpayable_retail_order_v1'
  check(operation='nonpayable_retail_order_v1'),
 window_start timestamptz not null,
 attempts integer not null check(attempts between 1 and 10),
 updated_at timestamptz not null default now()
);
alter table apex_internal.retail_admission_budgets_v1 enable row level security;
revoke all on table apex_internal.retail_admission_budgets_v1
 from public,anon,authenticated,service_role,apex_retail_checkout_executor,
      apex_retail_checkout_app;

-- Fixed-purpose privileged functions live ONLY in the unexposed private
-- schema, with pinned search_path and no dynamic SQL, and are callable only
-- by the existing NOLOGIN executor. The unprivileged app login must switch
-- transaction-locally to executor before invoking.
create function apex_internal.checkout_worker_consume_retail_budget_v1(
 p_subject_id uuid,p_operation text
) returns boolean language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_window timestamptz;
 v_count integer;
begin
 if p_subject_id is null or
    p_subject_id='00000000-0000-0000-0000-000000000000'::uuid or
    p_operation is distinct from 'nonpayable_retail_order_v1'
 then return false;end if;

 -- PG date_bin uses a fixed anchor, independent of the caller's timezone.
 v_window:=date_bin('10 minutes',clock_timestamp(),
  '2000-01-01 00:00:00+00'::timestamptz);

 insert into apex_internal.retail_admission_budgets_v1
  (subject_id,operation,window_start,attempts,updated_at)
 values(p_subject_id,'nonpayable_retail_order_v1',v_window,1,clock_timestamp())
 on conflict(subject_id) do update
 set window_start=excluded.window_start,
     attempts=case
       when apex_internal.retail_admission_budgets_v1.window_start
         < excluded.window_start then 1
       else apex_internal.retail_admission_budgets_v1.attempts+1 end,
     updated_at=clock_timestamp()
 where apex_internal.retail_admission_budgets_v1.window_start
          < excluded.window_start
   or (apex_internal.retail_admission_budgets_v1.window_start
          = excluded.window_start and
       apex_internal.retail_admission_budgets_v1.attempts<10)
 returning attempts into v_count;
 -- The 11th+ attempt returns false, not an exception, and cannot create
 -- an extra counter under concurrent requests.
 return v_count is not null;
end $fn$;

-- Derive one seller store from the existing *same* vetted public catalog
-- projection. We deliberately reuse its supplier listing/admin/category/
-- visibility rules; we do not add product-name or tag blacklists.
-- No client store ID is accepted. Absent, cross-store or unpublished
-- products fail closed. Actual stock/price remains rechecked with locks
-- in the existing atomic hold transaction.
create function apex_internal.checkout_worker_resolve_retail_store_v1(
 p_items jsonb
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare
 v_quote jsonb;
 v_count integer;
 v_store uuid;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or
    jsonb_array_length(p_items) not between 1 and 8
 then return jsonb_build_object('verified',false);end if;

 -- Quote validation rejects duplicate IDs, malformed quantities and
 -- mixed-store carts and applies the existing current display rules.
 v_quote:=public.get_public_retail_cart_quote_source(p_items,'');
 if v_quote->>'state' is distinct from 'rechecked_inventory_cart' or
    jsonb_typeof(v_quote->'items') is distinct from 'array' or
    jsonb_array_length(v_quote->'items')<>jsonb_array_length(p_items) or
    exists(
     select 1 from jsonb_array_elements(v_quote->'items') as line(value)
     where line.value->>'availability' is distinct from 'in_stock'
    )
 then return jsonb_build_object('verified',false);end if;

 v_count:=jsonb_array_length(p_items);
 -- Quote source has already validated every product_id UUID. Compare
 -- count and single store again using the database's canonical relation.
 select p.store_id into v_store
 from public.products p
 join jsonb_array_elements(p_items) as supplied(value)
   on p.id=(supplied.value->>'product_id')::uuid
 group by p.store_id
 having count(*)=v_count;
 if v_store is null then
  return jsonb_build_object('verified',false);
 end if;
 return jsonb_build_object('verified',true,'storeId',v_store::text);
end $fn$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless revoked.
revoke all on function apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)
 from public,anon,authenticated,service_role,apex_retail_checkout_app;
revoke all on function apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)
 from public,anon,authenticated,service_role,apex_retail_checkout_app;
grant execute on function apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)
 to apex_retail_checkout_executor;
grant execute on function apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)
 to apex_retail_checkout_executor;

do $postflight$
begin
 if has_table_privilege('apex_retail_checkout_executor',
     'apex_internal.retail_admission_budgets_v1','SELECT') or
    has_table_privilege('apex_retail_checkout_executor',
     'apex_internal.retail_admission_budgets_v1','UPDATE') or
    has_table_privilege('apex_retail_checkout_app',
     'apex_internal.retail_admission_budgets_v1','INSERT') or
    has_function_privilege('anon',
     'apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)','EXECUTE') or
    has_function_privilege('authenticated',
     'apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)','EXECUTE') or
    has_function_privilege('service_role',
     'apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)','EXECUTE') or
    not has_function_privilege('apex_retail_checkout_executor',
     'apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)','EXECUTE') or
    not has_function_privilege('apex_retail_checkout_executor',
     'apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)','EXECUTE') or
    (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
      is distinct from false
 then raise exception 'Retail admission guard leaked privileges or commerce gate';end if;
end $postflight$;
commit;
