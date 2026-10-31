-- Verify the RPC cannot modify published/scheduled/active payout rules.
-- Test as a single transaction with a privileged fixture update followed by
-- a role-restricted RPC call. All changes are rolled back.
begin;
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values('20000000-0000-0000-0000-000000000099','storefront',
 '30000000-0000-0000-0000-000000000001',99,'active',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
values('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001',10000);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$ begin
 begin
  perform public.save_payout_rule_draft('20000000-0000-0000-0000-000000000099',
  'storefront','30000000-0000-0000-0000-000000000001',
  '[{"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":10000}]');
  raise exception 'SECURITY TEST FAILURE: active rule edited';
 exception when others then
  if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
 end;
 if (select count(*) from public.payout_rule_allocations
 where rule_id='20000000-0000-0000-0000-000000000099' and recipient_id='10000000-0000-0000-0000-000000000001')<>1
 then raise exception 'SECURITY TEST FAILURE: active allocation changed'; end if;
end $$;
rollback;
