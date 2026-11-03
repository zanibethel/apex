-- Additional disposable fixture for PR #177 staged release lifecycle.
-- Preceding legacy public-soldout tests have concluded and gate is OFF.
\set ON_ERROR_STOP on
do $$
begin
 if (select enabled from apex_internal.private_release_gate where singleton=true)
   is distinct from false then raise exception 'Test release gate must begin OFF';end if;
end $$;

-- Mimic the hosted project's independently reviewed evidence fields.
alter table apex_internal.supplier_release_authorizations
 add column reviewed_at timestamptz,
 add column reviewed_by uuid,
 add column evidence_reference text;
alter table apex_internal.product_release_authorizations
 add column reviewed_at timestamptz,
 add column reviewed_by uuid,
 add column evidence_reference text;
update apex_internal.supplier_release_authorizations
 set reviewed_at=now(),reviewed_by='00000000-0000-0000-0000-000000000001',
 evidence_reference='disposable/regtest/seller-evidence',
 status='verified',valid_until=current_date+2;
update apex_internal.product_release_authorizations
 set reviewed_at=now(),reviewed_by='00000000-0000-0000-0000-000000000002',
 evidence_reference='disposable/regtest/product-evidence',
 status='verified',valid_until=current_date+2;
alter table apex_internal.private_release_gate
 add constraint private_release_gate_enabled_check check(enabled=false);

-- The first gallery test models public flags. The real Apex catalog deliberately
-- retains private base product/store flags for supplier editability.
update public.stores set is_public=false
 where id='62000000-0000-0000-0000-000000000001';
update public.products set is_published=false
 where id='64000000-0000-0000-0000-000000000001';

create table public.supplier_import_candidates (
 id uuid primary key, store_id uuid not null,review_status text not null
);
create table public.supplier_candidate_drafts(
 store_id uuid not null,product_id uuid not null,candidate_id uuid not null
);
insert into public.supplier_memberships(supplier_id,user_id,role)
values('61000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000001','owner');
-- Legacy fixture did not install protected readiness; verify replacement in
-- the staged migration without changing hosted auth or private user records.
create function public.get_private_release_readiness(uuid,uuid)
returns jsonb language sql as $stub$
 select '{"status_code":"public_release_disabled","effective_public":false}'::jsonb;
$stub$;
revoke all on function public.get_private_release_readiness(uuid,uuid) from public,anon;
grant execute on function public.get_private_release_readiness(uuid,uuid) to authenticated;
select 'verified_release_fixture_ready';
