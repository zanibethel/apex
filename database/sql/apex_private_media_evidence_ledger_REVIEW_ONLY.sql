-- REVIEW ONLY: append-only, private, per-submission MEDIA EVIDENCE ledger.
-- Not an approval for sale, public image delivery, drug authorization or checkout.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.private_product_review_states') is null
 or to_regclass('public.products') is null
 or to_regclass('apex_internal.private_release_gate') is null
 or not exists(select 1 from apex_internal.private_release_gate
   where singleton=true and enabled=false)
 then raise exception 'Private media-evidence preflight failed';end if;
end $preflight$;

create table public.private_media_evidence_events(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 product_id uuid not null,
 submission_id uuid not null,
 image_path text not null check(length(image_path) between 81 and 180),
 review_status text not null check(review_status in ('evidence_recorded','needs_correction')),
 identity_reference text not null default '' check(length(identity_reference)<=300),
 rights_reference text not null default '' check(length(rights_reference)<=300),
 note text not null check(length(btrim(note)) between 10 and 1000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(store_id,product_id)
  references public.products(store_id,id) on delete cascade,
 check(review_status='needs_correction' or (
   length(btrim(identity_reference))>=8 and length(btrim(rights_reference))>=8
 ))
);
create index private_media_evidence_by_product
 on public.private_media_evidence_events(store_id,product_id,created_at desc,id);

alter table public.private_media_evidence_events enable row level security;
revoke all on public.private_media_evidence_events from public,anon,authenticated;
grant select,insert on public.private_media_evidence_events to authenticated;

-- The event and its evidence references are admin-private, never disclosed
-- to suppliers, guests or a public catalog endpoint. Trusted Auth app_metadata
-- only, NOT user-editable user_metadata or an email address.
create policy private_media_evidence_admin_read
 on public.private_media_evidence_events for select to authenticated
 using ((select auth.uid()) is not null
  and (select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin');

create policy private_media_evidence_admin_insert
 on public.private_media_evidence_events for insert to authenticated
 with check (
  created_by=(select auth.uid())
  and (select auth.jwt()) #>> '{app_metadata,apex_role}'='platform_admin'
  and exists (
   select 1 from public.private_product_review_states r
   where r.store_id=private_media_evidence_events.store_id
    and r.product_id=private_media_evidence_events.product_id
    and r.submission_id=private_media_evidence_events.submission_id
    and r.snapshot->>'image_path'=private_media_evidence_events.image_path
    and (private_media_evidence_events.review_status='needs_correction'
      or r.status='approved_internal')
  )
  and exists (
   select 1 from public.products p
   where p.store_id=private_media_evidence_events.store_id
    and p.id=private_media_evidence_events.product_id
    and p.is_published=false and p.image_path=private_media_evidence_events.image_path
  )
 );

do $postflight$
begin
 if has_table_privilege('anon','public.private_media_evidence_events','SELECT')
 or has_table_privilege('anon','public.private_media_evidence_events','INSERT')
 or has_table_privilege('authenticated','public.private_media_evidence_events','UPDATE')
 or has_table_privilege('authenticated','public.private_media_evidence_events','DELETE')
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Media ledger privileges or release gate invalid';end if;
end $postflight$;
commit;
