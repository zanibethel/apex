-- Append-only supplier content review decisions for private staged retail cards.
-- Does not approve or publish public products, stock, SKUs or orders.
begin;

create table public.apex_supplier_parent_review_events (
 id bigint generated always as identity primary key,
 store_id uuid not null references public.stores(id) on delete restrict,
 source_batch text not null check(length(source_batch) between 3 and 80),
 parent_title text not null check(length(btrim(parent_title)) between 1 and 120),
 decision text not null check(decision in ('approved','needs_changes')),
 note text not null default '' check(length(note)<=500),
 reviewed_snapshot jsonb not null check (
  jsonb_typeof(reviewed_snapshot)='array'
  and jsonb_array_length(reviewed_snapshot) between 1 and 100
 ),
 reviewer_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 reviewed_at timestamptz not null default now()
);

create index apex_supplier_parent_review_history
 on public.apex_supplier_parent_review_events(store_id,source_batch,parent_title,id desc);

alter table public.apex_supplier_parent_review_events enable row level security;
alter table public.apex_supplier_parent_review_events force row level security;
revoke all on public.apex_supplier_parent_review_events from PUBLIC, anon, authenticated;
grant select on public.apex_supplier_parent_review_events to authenticated;
-- Only specified columns may be submitted. Reviewer and timestamp come from DB.
grant insert (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
 on public.apex_supplier_parent_review_events to authenticated;

create policy apex_supplier_parent_review_read
 on public.apex_supplier_parent_review_events for select to authenticated
 using (exists (
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=apex_supplier_parent_review_events.store_id and s.is_public=false
   and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 ));

create policy apex_supplier_parent_review_append
 on public.apex_supplier_parent_review_events for insert to authenticated
 with check (
  reviewer_id=(select auth.uid()) and
  exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=apex_supplier_parent_review_events.store_id and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
 );

-- This trigger is SECURITY INVOKER: a member only sees their own source rows
-- under the existing forced RLS policy. No exposed SECURITY DEFINER RPC.
create function public.apex_supplier_parent_review_validate_v1()
returns trigger language plpgsql security invoker
set search_path = ''
as $review$
declare
 current_snapshot jsonb;
 row_count integer;
 all_priced boolean;
begin
 if auth.uid() is null or new.reviewer_id is distinct from auth.uid()
 then raise exception 'Supplier identity required';end if;
 if new.decision='needs_changes' and length(btrim(new.note))<3
 then raise exception 'Explain what needs changes (at least 3 characters)';end if;
 if new.decision='approved' and new.note<>''
 then raise exception 'Approval needs no change note';end if;

 select jsonb_agg(jsonb_build_object(
   'id',r.id::text,
   'row',r.source_row,
   'sourceName',r.source_name,
   'section',r.source_section,
   'strength',r.strength,
   'size',r.size,
   'carrier',r.carrier_oil,
   'price',coalesce(r.retail_price_cents::text,''),
   'status',r.review_status,
   'note',r.review_note
 ) order by r.source_row,r.id),
 count(*)::integer,
 bool_and(r.review_status='pending_review' and r.retail_price_cents is not null)
 into current_snapshot,row_count,all_priced
 from public.apex_supplier_variant_review_items r
 where r.store_id=new.store_id and r.source_batch=new.source_batch
  and r.parent_title=new.parent_title;

 if row_count<1 or row_count>100 or current_snapshot is distinct from new.reviewed_snapshot
 then raise exception 'Product details have changed. Reload before reviewing.';end if;
 if new.decision='approved' and not coalesce(all_priced,false)
 then raise exception 'Unresolved product options cannot be approved';end if;
 return new;
end;
$review$;

revoke all on function public.apex_supplier_parent_review_validate_v1()
 from PUBLIC, anon, authenticated;
create trigger apex_supplier_parent_review_before_insert
before insert on public.apex_supplier_parent_review_events
for each row execute function public.apex_supplier_parent_review_validate_v1();

comment on table public.apex_supplier_parent_review_events is
 'Append-only private approval of supplier spreadsheet interpretation and retail prices. NOT a storefront publishing/release/eligibility approval.';

commit;