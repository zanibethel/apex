-- PR #127: SECOND disposable database inside the SAME GitHub Postgres
-- container. Roles are cluster-wide and were already created by the
-- upstream apex_journal_ci bootstrap: never recreate them here.
\set ON_ERROR_STOP on
do $$
begin
 if not exists(select 1 from pg_catalog.pg_roles where rolname='anon')
   or not exists(select 1 from pg_catalog.pg_roles
     where rolname='authenticated') then
   raise exception 'Expected CI-only global anon/authenticated roles';
 end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant usage on schema public to anon,authenticated;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
grant execute on function auth.jwt() to authenticated;
