-- PR212: private verified-sales review ledger. This does not create
-- fulfillment orders, customer addresses, tracking numbers or labels.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('public.supplier_sales_history') is null
  or to_regclass('public.supplier_memberships') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Sales reconciliation prerequisites not met';end if;
end $preflight$;

create table apex_internal.supplier_sales_review(
 sale_id uuid primary key references public.supplier_sales_history(id) on delete restrict,
 store_id uuid not null references public.stores(id) on delete restrict,
 review_state text not null default 'unreviewed'
  check(review_state in ('unreviewed','reviewed','needs_attention')),
 review_note text not null default '' check(length(review_note)<=240),
 version integer not null default 0 check(version between 0 and 10000000),
 updated_by uuid not null references auth.users(id) on delete restrict,
 updated_at timestamptz not null default now(),
 unique(store_id,sale_id)
);
alter table apex_internal.supplier_sales_review enable row level security;
alter table apex_internal.supplier_sales_review force row level security;
revoke all on apex_internal.supplier_sales_review from public,anon,authenticated;
comment on table apex_internal.supplier_sales_review is
 'Review annotations only; not proof of fulfillment, shipping, payment or legal product eligibility.';

create table apex_internal.supplier_sales_review_audit(
 id bigint generated always as identity primary key,
 sale_id uuid not null references public.supplier_sales_history(id) on delete restrict,
 store_id uuid not null references public.stores(id) on delete restrict,
 import_id uuid not null,
 changed_by uuid not null references auth.users(id) on delete restrict,
 previous_version integer not null check(previous_version>=0),
 new_version integer not null check(new_version=previous_version+1),
 previous_state text not null,
 new_state text not null,
 changed_at timestamptz not null default now(),
 unique(sale_id,new_version)
);
alter table apex_internal.supplier_sales_review_audit enable row level security;
alter table apex_internal.supplier_sales_review_audit force row level security;
revoke all on apex_internal.supplier_sales_review_audit from public,anon,authenticated;
create index apex_sales_review_audit_store_date_idx
 on apex_internal.supplier_sales_review_audit(store_id,changed_at);

create function public.get_supplier_sales_reconciliation(
 p_store_id uuid,p_limit integer default 200
) returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_rows jsonb;v_total integer;v_uid uuid:=(select auth.uid());
begin
 if v_uid is null or not exists(
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and m.user_id=v_uid
 ) then raise exception 'Supplier membership required' using errcode='42501';end if;
 if p_limit is null or p_limit<1 or p_limit>500 then
  raise exception 'Invalid sales reconciliation window' using errcode='22023';end if;
 select count(*)::integer into v_total
 from public.supplier_sales_history where store_id=p_store_id;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.purchased_at_utc desc,q.order_reference),'[]'::jsonb)
 into v_rows from(
  select h.order_reference,
   to_char(h.occurred_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as purchased_at_utc,
   h.sale_state,h.gross_cents::text as gross_cents,
   coalesce(r.review_state,'unreviewed') as review_state,
   coalesce(r.review_note,'') as review_note,
   coalesce(r.version,0) as version
  from public.supplier_sales_history h
  left join apex_internal.supplier_sales_review r
   on r.sale_id=h.id and r.store_id=h.store_id
  where h.store_id=p_store_id
  order by h.occurred_at desc,h.order_reference
  limit p_limit
 ) q;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,'total',v_total,
  'truncated',v_total>p_limit,'rows',v_rows,
  'source','verified_sales_history','shipping_data_available',false);
end $fn$;
revoke all on function public.get_supplier_sales_reconciliation(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.get_supplier_sales_reconciliation(uuid,integer)
 to authenticated;

-- Atomic review-only import:
-- identical replays are unchanged, edited stale versions are rejected,
-- unknown orders, changed purchase dates and cross-store rows are denied.
create function public.apply_supplier_sales_reconciliation(
 p_store_id uuid,p_import_id uuid,p_rows jsonb
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid()); v_item jsonb; v_count integer:=0;
 v_changed integer:=0;v_unchanged integer:=0;v_seen text[]:='{}';
 v_sale record;v_state text;v_note text;v_expected integer;
 v_old_state text;v_old_note text;v_version integer;
 v_purchase text;v_ref text;v_store text;
begin
 if v_uid is null or not exists(
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and m.user_id=v_uid
   and m.role in ('owner','manager')
 ) then raise exception 'Owner or manager required' using errcode='42501';end if;
 if p_import_id is null or p_rows is null
  or jsonb_typeof(p_rows)<>'array'
  or jsonb_array_length(p_rows) not between 1 and 300
 then raise exception 'Invalid CSV import batch' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(p_rows)
 loop
  if jsonb_typeof(v_item)<>'object'
   or (select count(*) from jsonb_object_keys(v_item))<>6
   or not(v_item ?& array['store_id','order_reference','purchased_at_utc',
    'review_state','review_note','version'])
  then raise exception 'Unexpected import row shape' using errcode='22023';end if;
  v_store:=v_item->>'store_id';
  v_ref:=v_item->>'order_reference';
  v_purchase:=v_item->>'purchased_at_utc';
  v_state:=v_item->>'review_state';
  v_note:=v_item->>'review_note';
  if v_store is distinct from p_store_id::text
   or v_ref is null or length(v_ref) not between 1 and 200
   or v_ref=any(v_seen)
   or v_purchase is null
   or v_purchase !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
   or v_state not in ('unreviewed','reviewed','needs_attention')
   or v_note is null or length(v_note)>240
   or jsonb_typeof(v_item->'version')<>'number'
   or (v_item->>'version') !~ '^(0|[1-9][0-9]{0,6})$'
  then raise exception 'Invalid, duplicate or cross-store import row'
   using errcode='22023';end if;
  v_seen:=array_append(v_seen,v_ref);
  v_expected:=(v_item->>'version')::integer;
  select h.id,h.occurred_at into v_sale
  from public.supplier_sales_history h
  where h.store_id=p_store_id and h.order_reference=v_ref
  for update;
  if not found
   or to_char(v_sale.occurred_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')<>v_purchase
  then raise exception 'Order reference missing or purchase timestamp mismatch'
    using errcode='22023';end if;
  select r.review_state,r.review_note,r.version
  into v_old_state,v_old_note,v_version
  from apex_internal.supplier_sales_review r
  where r.store_id=p_store_id and r.sale_id=v_sale.id for update;
  if not found then
   v_old_state:='unreviewed';v_old_note:='';v_version:=0;
  end if;
  if v_state=v_old_state and v_note=v_old_note then
   v_unchanged:=v_unchanged+1;
   continue;
  end if;
  if v_expected<>v_version then
   raise exception 'Stale review version; reload current report'
    using errcode='40001';end if;
  insert into apex_internal.supplier_sales_review(
   sale_id,store_id,review_state,review_note,version,updated_by,updated_at)
  values(v_sale.id,p_store_id,v_state,v_note,v_version+1,v_uid,now())
  on conflict(sale_id) do update set
   review_state=excluded.review_state,
   review_note=excluded.review_note,version=excluded.version,
   updated_by=excluded.updated_by,updated_at=now();
  insert into apex_internal.supplier_sales_review_audit(
   sale_id,store_id,import_id,changed_by,previous_version,new_version,
   previous_state,new_state)
  values(v_sale.id,p_store_id,p_import_id,v_uid,v_version,v_version+1,
   v_old_state,v_state);
  v_changed:=v_changed+1;
 end loop;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,'import_id',p_import_id,
  'processed',v_changed+v_unchanged,'updated',v_changed,
  'unchanged',v_unchanged,'duplicates_created',0,
  'shipping_state_modified',false);
end $fn$;
revoke all on function public.apply_supplier_sales_reconciliation(uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.apply_supplier_sales_reconciliation(uuid,uuid,jsonb)
 to authenticated;
do $postflight$
begin
 if has_table_privilege('authenticated','apex_internal.supplier_sales_review','INSERT')
  or has_table_privilege('anon','apex_internal.supplier_sales_review','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_sales_review_audit','SELECT')
  or has_function_privilege('anon',
   'public.apply_supplier_sales_reconciliation(uuid,uuid,jsonb)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Supplier sales review privileges invalid';end if;
end $postflight$;
commit;
