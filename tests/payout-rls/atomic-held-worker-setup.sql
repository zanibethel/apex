-- Disposable admin-seeded attestations. Not signed-event verification.
-- Independent actual source authentication is intentionally absent.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or to_regrole('apex_test_held_order_worker') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 then raise exception 'Held worker setup denied';end if;
end $preflight$;
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000614-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'APEX-HELD-WORKER-SYNTH-A','confirmed',10500,'USD',
 '2026-11-04 10:00:00+00');
insert into apex_internal.held_order_worker_bindings(store_id,active)
values('62000000-0000-0000-0000-000000000001',true);
insert into apex_internal.held_order_source_permits(
 id,store_id,sale_id,source_sha256,attestation_origin,issued_at,expires_at)
values
 ('69000614-0000-4000-8000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '65000614-0000-4000-8000-000000000001',
  repeat('f',64),'independent_test_review',
  clock_timestamp(),clock_timestamp()+interval '5 minutes'),
 ('69000614-0000-4000-8000-000000000002',
  '62000000-0000-0000-0000-000000000001',
  '65000614-0000-4000-8000-000000000001',
  repeat('f',64),'independent_test_review',
  clock_timestamp(),clock_timestamp()+interval '5 minutes'),
 ('69000614-0000-4000-8000-000000000003',
  '62000000-0000-0000-0000-000000000001',
  '65000614-0000-4000-8000-000000000001',
  repeat('f',64),'independent_test_review',
  clock_timestamp(),clock_timestamp()+interval '5 minutes'),
 ('69000614-0000-4000-8000-000000000004',
  '62000000-0000-0000-0000-000000000001',
  '65000614-0000-4000-8000-000000000001',
  repeat('f',64),'independent_test_review',
  clock_timestamp()-interval '6 minutes',
  clock_timestamp()-interval '1 minute');

do $privs$
declare r pg_roles%rowtype; v_name text;
begin
 select * into r from pg_roles where rolname='apex_test_held_order_worker';
 if not found or r.rolsuper or r.rolinherit or r.rolcreatedb
 or r.rolcreaterole or r.rolreplication or r.rolbypassrls
 or not r.rolcanlogin
 then raise exception 'Worker has excessive privileges';end if;
 if exists(select 1 from pg_auth_members m join pg_roles p
  on p.oid=m.member where p.rolname='apex_test_held_order_worker')
 then raise exception 'Worker has inherited membership';end if;
 if not has_function_privilege('apex_test_held_order_worker',
    'apex_test_order_worker.commit_attested_held_order(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated',
    'apex_test_order_worker.commit_attested_held_order(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('anon',
    'apex_test_order_worker.record_held_order_denial(uuid,text,text)','EXECUTE')
 then raise exception 'Worker function grant unsafe';end if;
end $privs$;
