-- Supplier-safe feedback projection, appended atomically from admin evidence events.
-- No source document IDs, internal rights references or private image URLs.
-- No public approval, listing permission or checkout behavior is changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $gate$
begin
 if to_regclass('public.private_media_evidence_events') is null
  or to_regclass('public.private_product_review_states') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Private media feedback preflight failed';end if;
end $gate$;

create table public.supplier_media_feedback_events(
 evidence_event_id uuid primary key references public.private_media_evidence_events(id) on delete restrict,
 store_id uuid not null,
 product_id uuid not null,
 submission_id uuid not null,
 image_path text not null,
 outcome text not null check(outcome in ('evidence_recorded','needs_correction')),
 supplier_note text not null check(length(supplier_note)<=1000),
 created_at timestamptz not null,
 foreign key(store_id,product_id) references public.products(store_id,id) on delete cascade,
 check(outcome='needs_correction' or supplier_note='')
);
create index supplier_media_feedback_by_store
 on public.supplier_media_feedback_events(store_id,created_at desc,evidence_event_id);

alter table public.supplier_media_feedback_events enable row level security;
revoke all on public.supplier_media_feedback_events from public,anon,authenticated;
grant select,insert on public.supplier_media_feedback_events to authenticated;

create policy supplier_media_feedback_own_store_read
 on public.supplier_media_feedback_events for select to authenticated
 using ((select auth.uid()) is not null and exists(
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=supplier_media_feedback_events.store_id
   and s.is_public=false and m.user_id=(select auth.uid())
   and m.role in ('owner','manager')
 ));
-- Only a trusted platform-admin connection may write the supplier-safe
-- projection. A supplier cannot insert forged feedback or edit existing notes.
create policy supplier_media_feedback_admin_insert
 on public.supplier_media_feedback_events for insert to authenticated
 with check ((select auth.uid()) is not null
  and (select auth.jwt())#>>'{app_metadata,apex_role}'='platform_admin'
  and exists (
   select 1 from public.private_media_evidence_events e
    where e.id=evidence_event_id
     and e.store_id=supplier_media_feedback_events.store_id
     and e.product_id=supplier_media_feedback_events.product_id
     and e.submission_id=supplier_media_feedback_events.submission_id
     and e.image_path=supplier_media_feedback_events.image_path
     and e.review_status=supplier_media_feedback_events.outcome
     and e.created_at=supplier_media_feedback_events.created_at
     and supplier_media_feedback_events.supplier_note=
      (case when e.review_status='needs_correction' then e.note else '' end)
  )
 );
-- This is SECURITY INVOKER: the signed-in admin's own grants and RLS are
-- enforced on both the private source event and the supplier-safe destination.
create function apex_internal.forward_supplier_media_feedback()
 returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
 insert into public.supplier_media_feedback_events(
  evidence_event_id,store_id,product_id,submission_id,image_path,
  outcome,supplier_note,created_at
 ) values (
  new.id,new.store_id,new.product_id,new.submission_id,new.image_path,
  new.review_status,
  case when new.review_status='needs_correction' then new.note else '' end,
  new.created_at
 );
 return new;
end $fn$;
revoke all on function apex_internal.forward_supplier_media_feedback()
 from public,anon,authenticated;
create trigger forward_supplier_media_feedback_after_insert
 after insert on public.private_media_evidence_events
 for each row execute function apex_internal.forward_supplier_media_feedback();

do $post$
begin
 if has_table_privilege('anon','public.supplier_media_feedback_events','SELECT')
  or has_table_privilege('anon','public.supplier_media_feedback_events','INSERT')
  or has_table_privilege('authenticated','public.supplier_media_feedback_events','UPDATE')
  or has_table_privilege('authenticated','public.supplier_media_feedback_events','DELETE')
  or has_table_privilege('authenticated','public.private_media_evidence_events','UPDATE')
  or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Private media feedback grants or public release gate unsafe';end if;
end $post$;
commit;
