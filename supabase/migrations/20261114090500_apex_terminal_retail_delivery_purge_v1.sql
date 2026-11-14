-- Proposed only: unpayable terminal encrypted-delivery minimization.
-- Apply only after isolated PostgreSQL tests and separate operator approval.
-- Does not change public checkout, inventory, product, payment or payout gates.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('apex_internal.retail_order_delivery_envelopes') is null or
    to_regprocedure('apex_internal.reject_retail_delivery_mutation()') is null or
    to_regprocedure('cron.schedule(text,text,text)') is null or
    to_regclass('cron.job') is null or
    (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
      is distinct from false or
    exists(select 1 from apex_internal.retail_order_holds where state='held_no_payment') or
    exists(select 1 from cron.job where jobname='apex-retail-delivery-purge-v1')
 then raise exception 'Private purge prerequisites unavailable or order engine active';end if;
end $preflight$;
-- All UPDATEs and all active-order DELETEs remain blocked.
-- The owning pg_cron session can delete terminal delivery after one hour.
-- API roles, app login and executor retain no table DELETE privileges.
create or replace function apex_internal.reject_retail_delivery_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $fn$
begin
 if TG_OP='DELETE' and exists(
  select 1 from apex_internal.retail_order_holds h
   where h.id=old.order_id and h.store_id=old.store_id
    and h.state in ('expired_no_payment','cancelled_no_payment')
    and h.ended_at<=clock_timestamp()-interval '1 hour'
 ) then return old;end if;
 raise exception 'Retail delivery envelopes immutable until terminal retention expires'
  using errcode='42501';
end $fn$;
create function apex_internal.purge_terminal_retail_delivery_v1(p_limit integer)
returns integer language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare v_deleted integer;
begin
 if p_limit is null or p_limit<1 or p_limit>100
 then raise exception 'Invalid private cleanup batch' using errcode='22023';end if;
 with due as (
  select e.order_id from apex_internal.retail_order_delivery_envelopes e
  join apex_internal.retail_order_holds h
   on h.id=e.order_id and h.store_id=e.store_id
  where h.state in ('expired_no_payment','cancelled_no_payment')
   and h.ended_at<=clock_timestamp()-interval '1 hour'
  order by h.ended_at,e.order_id
  for update of e skip locked
  limit p_limit
 )
 delete from apex_internal.retail_order_delivery_envelopes e
  using due where e.order_id=due.order_id;
 get diagnostics v_deleted=row_count;
 return v_deleted;
end $fn$;
revoke all on function apex_internal.purge_terminal_retail_delivery_v1(integer)
 from public,anon,authenticated,service_role,
 apex_retail_checkout_app,apex_retail_checkout_executor;
select cron.schedule('apex-retail-delivery-purge-v1','*/5 * * * *',
 'select apex_internal.purge_terminal_retail_delivery_v1(100);');
do $postflight$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton=true)
   is distinct from false or
    (select count(*) from cron.job where jobname='apex-retail-delivery-purge-v1'
      and active=true and schedule='*/5 * * * *')<>1 or
    has_table_privilege('anon','apex_internal.retail_order_delivery_envelopes','DELETE') or
    has_table_privilege('authenticated','apex_internal.retail_order_delivery_envelopes','DELETE') or
    has_table_privilege('service_role','apex_internal.retail_order_delivery_envelopes','DELETE') or
    has_function_privilege('apex_retail_checkout_executor',
     'apex_internal.purge_terminal_retail_delivery_v1(integer)','EXECUTE')
 then raise exception 'Terminal purge privilege or release check failed';end if;
end $postflight$;
commit;
