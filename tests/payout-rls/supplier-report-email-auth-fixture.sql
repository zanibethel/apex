-- Isolated CI only: Supabase auth fixture uses a simplified users table.
do $guard$
begin
 if current_database()<>'apex_test'
 then raise exception 'Test auth extension may not run in production';end if;
end $guard$;
alter table auth.users add column email text;
alter table auth.users add column email_confirmed_at timestamptz;
update auth.users
 set email=case when id='00000000-0000-0000-0000-000000000002'
  then 'supplier.fixture@example.test' else 'unrelated@example.test' end,
 email_confirmed_at=now();
insert into public.supplier_memberships(supplier_id,user_id,role)
 values('61000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','owner')
 on conflict do nothing;
