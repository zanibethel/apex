-- Disposable PostgreSQL integration only. PRIVATE APIs stay outside
-- PostgREST exposed schemas; the real order engine remains disabled.
do $acl$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
      is distinct from false or
    has_function_privilege('anon',
      'apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)','EXECUTE') or
    has_function_privilege('authenticated',
      'apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)','EXECUTE') or
    has_function_privilege('service_role',
      'apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)','EXECUTE') or
    has_table_privilege('apex_retail_checkout_executor',
      'apex_internal.retail_admission_budgets_v1','SELECT') or
    has_table_privilege('apex_retail_checkout_executor',
      'apex_internal.retail_admission_budgets_v1','UPDATE') or
    not has_function_privilege('apex_retail_checkout_executor',
      'apex_internal.checkout_worker_consume_retail_budget_v1(uuid,text)','EXECUTE') or
    not has_function_privilege('apex_retail_checkout_executor',
      'apex_internal.checkout_worker_resolve_retail_store_v1(jsonb)','EXECUTE')
 then raise exception 'Private admission grants are not correctly isolated';end if;
end $acl$;

set role apex_retail_checkout_executor;
do $rate$
declare
 v_subject uuid:='75d00b00-0c48-468d-99a5-95b4c8346e10';
 v_ok boolean;
begin
 -- 10 across the whole project / all serverless instances, then deny.
 for i in 1..10 loop
  v_ok:=apex_internal.checkout_worker_consume_retail_budget_v1(
   v_subject,'nonpayable_retail_order_v1');
  if v_ok is distinct from true
  then raise exception 'Expected admission % of 10',i;end if;
 end loop;
 for i in 11..15 loop
  v_ok:=apex_internal.checkout_worker_consume_retail_budget_v1(
   v_subject,'nonpayable_retail_order_v1');
  if v_ok is distinct from false
  then raise exception 'Allowed over-budget attempt %',i;end if;
 end loop;
 if apex_internal.checkout_worker_consume_retail_budget_v1(
  v_subject,'anything_else') is distinct from false or
    apex_internal.checkout_worker_consume_retail_budget_v1(
     null,'nonpayable_retail_order_v1') is distinct from false
 then raise exception 'Unknown operation/subject accepted';end if;
end $rate$;

do $store$
declare
 v_json jsonb;
 v_s1 uuid:='10000000-0000-4000-8000-000000000001';
begin
 v_json:=apex_internal.checkout_worker_resolve_retail_store_v1(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb);
 if v_json->>'verified'<>'true' or (v_json->>'storeId')::uuid<>v_s1
 then raise exception 'Approved synthetic shirt failed single-store resolution: %',v_json;end if;

 v_json:=apex_internal.checkout_worker_resolve_retail_store_v1(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
    {"product_id":"50000000-0000-4000-8000-000000000004","quantity":1}]'::jsonb);
 if v_json->>'verified' is distinct from 'false'
 then raise exception 'Mixed-store cart should fail closed';end if;

 v_json:=apex_internal.checkout_worker_resolve_retail_store_v1(
  '[{"product_id":"00000000-0000-0000-0000-000000000999","quantity":1}]'::jsonb);
 if v_json->>'verified' is distinct from 'false'
 then raise exception 'Unknown product was scoped to a store';end if;

 v_json:=apex_internal.checkout_worker_resolve_retail_store_v1(
  '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1},
    {"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb);
 if v_json->>'verified' is distinct from 'false'
 then raise exception 'Duplicate product was accepted';end if;
end $store$;
reset role;

do $window$
declare
 v_subject uuid:='75d00b00-0c48-468d-99a5-95b4c8346e10';
 v_total integer;
begin
 select attempts into v_total from apex_internal.retail_admission_budgets_v1
 where subject_id=v_subject;
 if v_total<>10 then raise exception 'Attempt budget was not capped at 10';end if;
 -- Advance only the disposable fixture's window; no sleeps or clock overrides.
 update apex_internal.retail_admission_budgets_v1
 set window_start=window_start-interval '20 minutes'
 where subject_id=v_subject;
end $window$;
set role apex_retail_checkout_executor;
do $reset$
begin
 if apex_internal.checkout_worker_consume_retail_budget_v1(
  '75d00b00-0c48-468d-99a5-95b4c8346e10',
  'nonpayable_retail_order_v1') is distinct from true
 then raise exception 'Expired ten-minute budget did not reset';end if;
end $reset$;
reset role;
do $postflight$
begin
 if (select attempts from apex_internal.retail_admission_budgets_v1
  where subject_id='75d00b00-0c48-468d-99a5-95b4c8346e10')<>1 or
    (select count(*) from apex_internal.retail_admission_budgets_v1)<>1 or
    (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
      is distinct from false
 then raise exception 'Admission reset retained count or altered commerce gate';end if;
end $postflight$;
