-- Run only on disposable Postgres after all three migrations.
insert into public.stores(id,supplier_id,slug,display_name)
select '30000000-0000-0000-0000-000000000001',s.id,'test-store','Test store'
from (insert into public.suppliers(slug,display_name) values('test-supplier','Test supplier') returning id) s;
-- Test the RPC as a real RLS-constrained authenticated role.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.save_payout_rule_draft(null,'storefront','30000000-0000-0000-0000-000000000001',
 '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":6000},{"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":4000}]');
do $$
begin
 if (select count(*) from public.payout_rule_allocations)<>2 then
  raise exception 'Expected two saved allocations';
 end if;
end $$;
rollback;
-- Negative checks use SQLSTATE caught by a temporary helper block.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 begin
  perform public.save_payout_rule_draft(null,'storefront','30000000-0000-0000-0000-000000000001',
  '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":10000}]');
  raise exception 'SECURITY TEST FAILURE: non-admin saved draft';
 exception when others then
  if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
 end;
end $$;
rollback;
