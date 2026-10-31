-- Synthetic CI-only read-access checks after the full review integrity fixture.
-- Do not run against the hosted Apex Supabase database.
\set ON_ERROR_STOP on

do $assert$
begin
 if (select count(*) from public.private_product_review_history) < 5
 or (select count(*) from public.private_product_review_history where event_type='review_invalidated') <> 3
 or (select count(*) from public.private_product_review_history where event_type='approved_internal') < 2
 then raise exception 'Review history events are missing from synthetic workflow'; end if;

 if exists (select 1 from public.private_product_review_history
  where snapshot is null or event_type is null or created_at is null)
 then raise exception 'History entries are incomplete'; end if;

 if has_table_privilege('anon','public.private_product_review_history','SELECT')
  or has_table_privilege('authenticated','public.private_product_review_history','INSERT')
  or has_table_privilege('authenticated','public.private_product_review_history','UPDATE')
  or has_table_privilege('authenticated','public.private_product_review_history','DELETE')
  or not (select relrowsecurity from pg_class where oid='public.private_product_review_history'::regclass)
 then raise exception 'Append-only history privileges are unsafe'; end if;
end $assert$;

set role anon;
do $assert$
begin
 if exists (select 1 from public.private_product_review_history)
 then raise exception 'Anonymous user accessed private audit history'; end if;
end $assert$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $assert$
begin
 if exists (select 1 from public.private_product_review_history
  where store_id='20000000-0000-4000-8000-000000000003')
 then raise exception 'Other supplier accessed Beta review history'; end if;
end $assert$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
do $assert$
begin
 if exists (select 1 from public.private_product_review_history)
 then raise exception 'Unassigned authenticated user accessed review history'; end if;
end $assert$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $assert$
begin
 if (select count(*) from public.private_product_review_history
     where store_id='20000000-0000-4000-8000-000000000003') < 5
 then raise exception 'Store manager cannot read own append-only review history'; end if;
end $assert$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
do $assert$
begin
 if (select count(*) from public.private_product_review_history
   where store_id='20000000-0000-4000-8000-000000000003') < 5
 then raise exception 'Verified admin cannot access the private review audit history'; end if;
end $assert$;
reset role;

do $assert$
begin
 if exists (
  select 1 from public.private_product_review_states r
  join public.products p on p.store_id=r.store_id and p.id=r.product_id
  where p.is_published
 ) or exists(select 1 from public.stores
   where id='20000000-0000-4000-8000-000000000003' and is_public)
 then raise exception 'Review history test unexpectedly published a product'; end if;
end $assert$;
\echo PASS: audit history remains append-only, tenant-scoped and admin-readable.
