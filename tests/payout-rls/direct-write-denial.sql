-- Negative permission tests: no authenticated direct payout draft table writes.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$ begin
 if has_table_privilege('authenticated','public.payout_rules','INSERT') then
  raise exception 'SECURITY FAILURE: direct payout_rules INSERT granted'; end if;
 if has_table_privilege('authenticated','public.payout_rule_allocations','INSERT') then
  raise exception 'SECURITY FAILURE: direct allocations INSERT granted'; end if;
 if has_table_privilege('authenticated','public.payout_rule_allocations','DELETE') then
  raise exception 'SECURITY FAILURE: direct allocations DELETE granted'; end if;
end $$;
rollback;
-- Existing draft-rpc.sql covers valid save and unauthorized RPC denial.
