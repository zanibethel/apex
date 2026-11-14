-- Disposable PostgreSQL verification of the pg_cron installation contract.
-- Actual pg_cron exists on the connected production project; here cron.schedule
-- is a local fake that records only expected SQL and schedule (no cron daemon).
do $$
begin
 if (select count(*) from cron.job
  where jobname='apex-retail-unpaid-holds-expire-v1'
    and schedule='* * * * *'
    and command='select apex_internal.expire_due_retail_order_holds(100);'
    and active=true)<>1
 then raise exception 'Private expiry cron missing or incorrect';end if;
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
   is distinct from false
 then raise exception 'Cron installation opened order admission';end if;
 if exists(select 1 from apex_internal.retail_order_holds
    where state='held_no_payment')
 then raise exception 'Cron installed with active held orders';end if;
 if has_function_privilege('anon',
   'apex_internal.expire_due_retail_order_holds(integer)','EXECUTE') or
    has_function_privilege('authenticated',
   'apex_internal.expire_due_retail_order_holds(integer)','EXECUTE') or
    has_function_privilege('service_role',
   'apex_internal.expire_due_retail_order_holds(integer)','EXECUTE')
 then raise exception 'Cron schedule leaked private hold-expiry execution';end if;
 if apex_internal.expire_due_retail_order_holds(100)<>0
 then raise exception 'Expired-hold cleanup unexpectedly processed a request';end if;
end $$;

-- Same schedule must not silently create a duplicate job. It deliberately
-- fails and rolls back its own preflight when attempted twice.
do $$
begin
 begin
  if exists(select 1 from cron.job
   where jobname='apex-retail-unpaid-holds-expire-v1')
  then raise exception 'Existing retail expiry job must be reviewed before replacing';end if;
  raise exception 'Missing duplicate-job guard';
 exception when others then
  if SQLERRM='Missing duplicate-job guard' then raise;end if;
  if SQLERRM not like '%must be reviewed%' then raise;end if;
 end;
end $$;
