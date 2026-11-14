-- Built-in Supabase pg_cron cleanup for unpaid, expired retail holds.
-- Runs under PostgreSQL owner; no HTTP endpoint, external worker token,
-- privileged Data API grant, or dependency on a Vercel deployment.
-- The order engine remains OFF; the job is harmless while no holds exist.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.retail_order_holds') is null or
  to_regprocedure('apex_internal.expire_due_retail_order_holds(integer)') is null or
  to_regprocedure('cron.schedule(text,text,text)') is null or
  to_regclass('cron.job') is null
 then raise exception 'Private hold expiry schedule prerequisites missing';end if;
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
  is distinct from false or
  (select count(*) from apex_internal.retail_order_holds where state='held_no_payment')<>0
 then raise exception 'Refusing to install expiry schedule with active order admission';end if;
 if exists(select 1 from cron.job where jobname='apex-retail-unpaid-holds-expire-v1')
 then raise exception 'Existing retail expiry job must be reviewed before replacing';end if;
end $preflight$;

-- Every minute, release at most 100 expired unpaid reservations.
-- The private function itself locks each hold with SKIP LOCKED, and an
-- idempotent terminal transition restores stock only once. This does not
-- count a held order as a paid sale or authorize fulfillment.
select cron.schedule('apex-retail-unpaid-holds-expire-v1','* * * * *',
 'select apex_internal.expire_due_retail_order_holds(100);');

do $postflight$
begin
 if (select count(*) from cron.job
     where jobname='apex-retail-unpaid-holds-expire-v1'
      and schedule='* * * * *'
      and command='select apex_internal.expire_due_retail_order_holds(100);'
      and active=true)<>1
 then raise exception 'Retail expiry cron not installed as intended';end if;
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
  is distinct from false
 then raise exception 'Installing expiry cron must not activate customer orders';end if;
end $postflight$;
commit;
