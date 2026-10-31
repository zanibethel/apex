#!/usr/bin/env bash
set -euo pipefail
# Two authenticated sessions race to create a draft for one scope.
# Advisory transaction lock must serialize version selection.
scope='30000000-0000-0000-0000-000000000001'
payload='[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":6000},{"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":4000}]'
run_save() {
  psql -X -v ON_ERROR_STOP=1 -At <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.save_payout_rule_draft(null,'storefront','$scope','$payload'::jsonb);
select pg_sleep(1);
commit;
SQL
}
# Ensure fixture store exists, and race against a fresh version baseline.
psql -X -v ON_ERROR_STOP=1 -Atc "select 1 from public.stores where id='$scope'" | grep -qx 1
before=$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from public.payout_rules where scope_type='storefront' and scope_id='$scope'")
run_save > /tmp/apex-save-a.log 2>&1 & a=$!
run_save > /tmp/apex-save-b.log 2>&1 & b=$!
wait "$a" || { cat /tmp/apex-save-a.log; exit 1; }
wait "$b" || { cat /tmp/apex-save-b.log; exit 1; }
psql -X -v ON_ERROR_STOP=1 -At <<SQL
do \$\$
declare
 v_count integer;
 v_distinct integer;
 v_max integer;
 v_min integer;
begin
 select count(*),count(distinct version),max(version),min(version)
 into v_count,v_distinct,v_max,v_min
 from (select version from public.payout_rules
       where scope_type='storefront' and scope_id='$scope'
       order by version desc limit 2) q;
 if v_count<>2 or v_distinct<>2 or v_max-v_min<>1 then
  raise exception 'CONCURRENCY FAILURE: expected two adjacent distinct versions';
 end if;
 if (select count(*) from public.payout_rules where scope_type='storefront' and scope_id='$scope') <> $before+2 then
  raise exception 'CONCURRENCY FAILURE: expected exactly two committed drafts';
 end if;
end \$\$;
SQL
