-- Optional administrator record of verification performed outside Apex.
-- This records evidence references and reviewer decisions; it never authorizes
-- public listing, checkout, invoice creation, fulfillment, or regulated commerce.
-- Scope: existing products in private supplier stores only.
begin;

create table if not exists apex_internal.admin_offline_product_reviews (
 store_id uuid not null,
 product_id uuid not null,
 status text not null check (status in ('approved','follow_up','revoked')),
 evidence_reference text not null default '',
 review_note text not null default '',
 product_fingerprint text not null,
 valid_until date,
 reviewed_by uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 primary key (store_id,product_id),
 foreign key (store_id,product_id) references public.products(store_id,id) on delete cascade,
 constraint admin_offline_review_reference_len check(length(evidence_reference)<=200),
 constraint admin_offline_review_note_len check(length(review_note)<=1000)
);
create table if not exists apex_internal.admin_offline_product_review_events (
 id bigint generated always as identity primary key,
 store_id uuid not null,
 product_id uuid not null,
 status text not null check (status in ('approved','follow_up','revoked')),
 evidence_reference text not null,
 review_note text not null,
 product_fingerprint text not null,
 valid_until date,
 actor_id uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
create index if not exists admin_offline_product_review_events_lookup
 on apex_internal.admin_offline_product_review_events(store_id,product_id,id desc);
alter table apex_internal.admin_offline_product_reviews enable row level security;
alter table apex_internal.admin_offline_product_reviews force row level security;
alter table apex_internal.admin_offline_product_review_events enable row level security;
alter table apex_internal.admin_offline_product_review_events force row level security;
revoke all on apex_internal.admin_offline_product_reviews from public,anon,authenticated;
revoke all on apex_internal.admin_offline_product_review_events from public,anon,authenticated;
revoke all on sequence apex_internal.admin_offline_product_review_events_id_seq
 from public,anon,authenticated;

create or replace function public.get_admin_offline_product_reviews()
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rows jsonb;
begin
 if (select auth.uid()) is null or
  (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform administrator required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'store_id',r.store_id,'product_id',r.product_id,
  'status',r.status,'evidence_reference',r.evidence_reference,
  'review_note',r.review_note,'valid_until',r.valid_until,
  'reviewed_at',r.reviewed_at,
  'current_product',r.product_fingerprint=md5(
    p.name||chr(31)||p.sku||chr(31)||coalesce(p.description,'')||chr(31)||
    coalesce(p.category_id::text,'')),
  'expired',r.valid_until is not null and r.valid_until<current_date
 ) order by r.reviewed_at desc,r.product_id),'[]'::jsonb)
 into v_rows
 from apex_internal.admin_offline_product_reviews r
 join public.products p on p.store_id=r.store_id and p.id=r.product_id
 join public.stores s on s.id=p.store_id and s.is_public=false;
 return v_rows;
end $$;
revoke all on function public.get_admin_offline_product_reviews() from public,anon;
grant execute on function public.get_admin_offline_product_reviews() to authenticated;

create or replace function public.set_admin_offline_product_review(
 p_store_id uuid,p_product_id uuid,p_status text,p_evidence_reference text,
 p_review_note text,p_valid_until date
) returns text language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_actor uuid:=(select auth.uid());
 v_product public.products%rowtype;
 v_reference text:=btrim(coalesce(p_evidence_reference,''));
 v_note text:=btrim(coalesce(p_review_note,''));
 v_fingerprint text;
begin
 if v_actor is null or
  (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform administrator required' using errcode='42501';end if;
 if p_status is null or p_status not in ('approved','follow_up','revoked') or
  length(v_reference)>200 or length(v_note)>1000 or
  (p_status='approved' and (length(v_reference)<3 or
    (p_valid_until is not null and p_valid_until<current_date))) or
  (p_status='follow_up' and length(v_note)<3)
 then raise exception 'Valid review status, evidence reference, and note required' using errcode='22023';end if;
 select p.* into v_product from public.products p
 join public.stores s on s.id=p.store_id and s.is_public=false
 where p.store_id=p_store_id and p.id=p_product_id and
  p.is_published=false and p.archived_at is null
 for update of p;
 if not found then raise exception 'Private product identity unavailable' using errcode='22023';end if;
 v_fingerprint:=md5(v_product.name||chr(31)||v_product.sku||chr(31)||
  coalesce(v_product.description,'')||chr(31)||coalesce(v_product.category_id::text,''));
 insert into apex_internal.admin_offline_product_reviews(
  store_id,product_id,status,evidence_reference,review_note,product_fingerprint,
  valid_until,reviewed_by,reviewed_at)
 values (p_store_id,p_product_id,p_status,v_reference,v_note,v_fingerprint,
  case when p_status='approved' then p_valid_until else null end,v_actor,now())
 on conflict (store_id,product_id) do update set
  status=excluded.status,evidence_reference=excluded.evidence_reference,
  review_note=excluded.review_note,product_fingerprint=excluded.product_fingerprint,
  valid_until=excluded.valid_until,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
 insert into apex_internal.admin_offline_product_review_events(
  store_id,product_id,status,evidence_reference,review_note,product_fingerprint,
  valid_until,actor_id)
 values(p_store_id,p_product_id,p_status,v_reference,v_note,v_fingerprint,
  case when p_status='approved' then p_valid_until else null end,v_actor);
 return case p_status
  when 'approved' then 'External review approval recorded. Public listing and checkout rules are unchanged.'
  when 'follow_up' then 'Follow-up requirement recorded. Public listing and checkout rules are unchanged.'
  else 'External review approval revoked. Public listing and checkout rules are unchanged.' end;
end $$;
revoke all on function public.set_admin_offline_product_review(uuid,uuid,text,text,text,date)
 from public,anon;
grant execute on function public.set_admin_offline_product_review(uuid,uuid,text,text,text,date)
 to authenticated;
commit;
