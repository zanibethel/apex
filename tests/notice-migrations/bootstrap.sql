-- Fully disposable PostgreSQL fixture; never run against live Supabase.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema apex_internal;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('test.actor',true),'')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
grant execute on function auth.jwt() to anon,authenticated;
create table public.stores(
 id uuid primary key,supplier_id uuid not null,is_public boolean not null,
 display_name text not null
);
create table public.supplier_memberships(
 supplier_id uuid not null,user_id uuid not null,role text not null,
 primary key(supplier_id,user_id)
);
insert into public.stores(id,supplier_id,is_public,display_name) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',false,'Supplier A'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',false,'Supplier B');
insert into public.supplier_memberships(supplier_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','manager');
revoke all on all tables in schema public from public,anon,authenticated;
