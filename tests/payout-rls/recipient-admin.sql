-- Isolated test: trusted admin can insert/update; ordinary user cannot.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
insert into public.payout_recipients(id,display_name,recipient_type,status)
values('40000000-0000-0000-0000-000000000001','Example recipient','partner','inactive');
update public.payout_recipients set display_name='Updated recipient',status='active'
where id='40000000-0000-0000-0000-000000000001';
do $$ begin
 if not exists(select 1 from public.payout_recipients
 where id='40000000-0000-0000-0000-000000000001' and display_name='Updated recipient' and status='active')
 then raise exception 'Admin recipient update did not persist'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$ begin
 begin
  insert into public.payout_recipients(display_name,recipient_type,status)
  values('Unauthorized recipient','partner','active');
  raise exception 'SECURITY TEST FAILURE: nonmember inserted recipient';
 exception when others then
  if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
 end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"customer"}}',true);
do $$ begin
 begin
  insert into public.payout_recipients(display_name,recipient_type,status)
  values('Role spoof','partner','active');
  raise exception 'SECURITY TEST FAILURE: non-admin role inserted recipient';
 exception when others then
  if sqlerrm like 'SECURITY TEST FAILURE%' then raise; end if;
 end;
end $$;
rollback;
