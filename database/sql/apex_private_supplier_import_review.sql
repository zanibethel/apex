-- Private import-review queue. NO supplier cost data is included in this public repository.
-- Apply only after supplier operations foundation and access-control tests have passed.
begin;
create table if not exists public.supplier_import_candidates (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 source_index integer not null check (source_index >= 0),
 product_name text not null check (char_length(trim(product_name)) between 1 and 140),
 strength text not null check (char_length(trim(strength)) between 1 and 80),
 wholesale_cost_cents bigint not null check(wholesale_cost_cents >= 0),
 review_status text not null default 'unverified'
   check(review_status in ('unverified','under_review','approved_for_draft','hold')),
 source_label text not null default 'supplier-cost-sheet-2026-10-28',
 created_at timestamptz not null default now(),
 unique(store_id,source_index)
);
alter table public.supplier_import_candidates enable row level security;
revoke all on public.supplier_import_candidates from anon, authenticated;
grant select, update(review_status) on public.supplier_import_candidates to authenticated;

create policy "supplier_private_import_read" on public.supplier_import_candidates
for select to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=supplier_import_candidates.store_id
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
));
create policy "supplier_private_import_review" on public.supplier_import_candidates
for update to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=supplier_import_candidates.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
))
with check (exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=supplier_import_candidates.store_id and s.is_public=false
  and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
));

create table if not exists public.supplier_import_review_audit (
 id bigint generated always as identity primary key,
 candidate_id uuid not null references public.supplier_import_candidates(id),
 store_id uuid not null references public.stores(id),
 actor_id uuid,
 before_status text,
 after_status text not null,
 changed_at timestamptz not null default now()
);
alter table public.supplier_import_review_audit enable row level security;
revoke all on public.supplier_import_review_audit from anon, authenticated;
grant select on public.supplier_import_review_audit to authenticated;
create policy "supplier_import_audit_read" on public.supplier_import_review_audit
for select to authenticated using (exists (
 select 1 from public.stores s join public.supplier_memberships sm
  on s.supplier_id=sm.supplier_id
 where s.id=supplier_import_review_audit.store_id
  and sm.user_id=(select auth.uid())
));
create or replace function apex_internal.audit_import_review()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $audit$
begin
 if new.review_status is distinct from old.review_status then
  insert into public.supplier_import_review_audit
   (candidate_id,store_id,actor_id,before_status,after_status)
  values(new.id,new.store_id,auth.uid(),old.review_status,new.review_status);
 end if;
 return new;
end
$audit$;
revoke all on function apex_internal.audit_import_review() from public,anon,authenticated;
create trigger supplier_candidate_review_audit
 after update of review_status on public.supplier_import_candidates
 for each row execute function apex_internal.audit_import_review();
commit;
