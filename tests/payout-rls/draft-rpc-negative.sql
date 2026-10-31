-- Additional negative cases against the privileged draft-saving RPC.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_payload jsonb;
begin
 for v_payload in
  select value from jsonb_array_elements(
   '[
     [{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":9999}],
     [{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":5000},{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":5000}],
     [{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":10001}],
     [{"recipient_id":"10000000-0000-0000-0000-000000000099","basis_points":10000}]
   ]'::jsonb)
 loop
  begin
   perform public.save_payout_rule_draft(null,'storefront','30000000-0000-0000-0000-000000000001',v_payload);
   raise exception 'SECURITY TEST FAILURE: invalid allocation accepted';
  exception when others then
   if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
  end;
 end loop;
 if exists(select 1 from public.payout_rules where scope_id='30000000-0000-0000-0000-000000000001')
 then raise exception 'SECURITY TEST FAILURE: invalid drafts persisted'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"customer"}}',true);
do $$ begin
 begin
  perform public.save_payout_rule_draft(null,'storefront','30000000-0000-0000-0000-000000000001',
  '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":10000}]');
  raise exception 'SECURITY TEST FAILURE: non-admin claim saved draft';
 exception when others then
  if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
 end;
end $$;
rollback;
