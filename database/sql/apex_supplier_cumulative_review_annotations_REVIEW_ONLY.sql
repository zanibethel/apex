-- Apex Issue #216 Phase 2: ATOMIC, review-annotation-only CSV import.
-- Disposable apex_test ONLY. Does not migrate or enable production fulfillment.
-- No order, payment, delivery, tracking, shipment or inventory state changes.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.review_shipment_plans') is null
  or to_regprocedure('public.get_supplier_review_fulfillment_queue(uuid,integer,integer)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Review annotation import requires disposable gated source';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table apex_internal.supplier_review_annotations (
 store_id uuid not null,
 row_key text not null check(length(row_key) between 36 and 160),
 order_id uuid not null,
 row_kind text not null check(row_kind in ('order_line','shipment_plan')),
 review_state text not null check(review_state in
  ('unreviewed','reviewed','needs_attention')),
 review_note text not null default '' check(length(review_note)<=240
  and review_note !~ '[[:cntrl:]]' and review_note !~ '@'),
 review_version integer not null check(review_version between 1 and 10000),
 updated_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(store_id,row_key),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id)
  on delete restrict
);
create table apex_internal.supplier_review_annotation_audit (
 audit_id bigint generated always as identity primary key,
 store_id uuid not null,
 row_key text not null,
 order_id uuid not null,
 request_id uuid not null,
 actor_uid uuid not null,
 before_state text not null,
 after_state text not null,
 before_note text not null,
 after_note text not null,
 before_version integer not null,
 after_version integer not null,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(store_id,request_id,row_key),
 check(after_version=before_version+1)
);
create table apex_internal.supplier_review_upload_receipts (
 store_id uuid not null,
 request_id uuid not null,
 actor_uid uuid not null,
 submitted_changes jsonb not null,
 outcome jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(store_id,request_id)
);
create trigger supplier_review_audit_immutable
 before update or delete on apex_internal.supplier_review_annotation_audit
 for each row execute function apex_internal.deny_order_detail_mutation();
create trigger supplier_review_receipts_immutable
 before update or delete on apex_internal.supplier_review_upload_receipts
 for each row execute function apex_internal.deny_order_detail_mutation();

alter table apex_internal.supplier_review_annotations enable row level security;
alter table apex_internal.supplier_review_annotations force row level security;
alter table apex_internal.supplier_review_annotation_audit enable row level security;
alter table apex_internal.supplier_review_annotation_audit force row level security;
alter table apex_internal.supplier_review_upload_receipts enable row level security;
alter table apex_internal.supplier_review_upload_receipts force row level security;
revoke all on apex_internal.supplier_review_annotations,
 apex_internal.supplier_review_annotation_audit,
 apex_internal.supplier_review_upload_receipts
 from public,anon,authenticated;
do $restricted$
begin
 if to_regrole('service_role') is not null then
  execute 'revoke all on apex_internal.supplier_review_annotations,
   apex_internal.supplier_review_annotation_audit,
   apex_internal.supplier_review_upload_receipts from service_role';
 end if;
end $restricted$;

-- Narrow read of review annotations, NOT the private audit or uploaded text.
create function public.get_supplier_cumulative_review_annotations(p_store_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid()); v_records jsonb;
begin
 if current_database()<>'apex_test'
  or v_uid is null or p_store_id is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on s.supplier_id=m.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
  )
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Review annotation access denied' using errcode='42501';end if;
 if (select count(*) from apex_internal.supplier_review_annotations a
   where a.store_id=p_store_id)>1000
 then raise exception 'Too many review annotations' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'row_key',a.row_key,'review_state',a.review_state,
  'review_note',a.review_note,'review_version',a.review_version)
  order by a.row_key),'[]'::jsonb)
 into v_records
 from apex_internal.supplier_review_annotations a where a.store_id=p_store_id;
 return jsonb_build_object('schema_version',1,'store_id',p_store_id,
  'source','held_review_annotations','records',v_records,
  'shipping_enabled',false,'fulfillment_updated',false);
end $fn$;

-- The only persistent operation: update review annotations. Every change
-- is checked against real held identity and current planning revision.
-- Unhandled exception aborts ALL changes, receipts and audit automatically.
create function public.apply_supplier_cumulative_review_annotations(
 p_store_id uuid,p_request_id uuid,p_changes jsonb)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_old_receipt apex_internal.supplier_review_upload_receipts%rowtype;
 v_item jsonb;
 v_order uuid;v_kind text;v_line integer;v_ship uuid;v_source_version integer;
 v_review_version integer;v_state text;v_note text;v_key text;v_last_key text:='';
 v_header apex_internal.order_detail_snapshots%rowtype;
 v_account apex_internal.held_order_intake_accounting%rowtype;
 v_plan apex_internal.review_shipment_plans%rowtype;
 v_current apex_internal.supplier_review_annotations%rowtype;
 v_updated integer:=0;v_unchanged integer:=0;v_already integer:=0;
 v_processed integer:=0;v_output jsonb;
begin
 if current_database()<>'apex_test'
  or v_uid is null or p_store_id is null or p_request_id is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on s.supplier_id=m.supplier_id
   where s.id=p_store_id and m.user_id=v_uid
    and m.role in ('owner','manager')
  )
  or p_changes is null or jsonb_typeof(p_changes)<>'array'
  or jsonb_array_length(p_changes)>500
 then raise exception 'Review import authentication or shape denied'
   using errcode='42501';end if;
 -- Lock one canonical store row so all uploads for this supplier serialize.
 -- This prevents competing new rows from both seeing version zero.
 perform 1 from public.stores s where s.id=p_store_id for update;
 if not found then raise exception 'Review store unavailable' using errcode='42501';end if;
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Review import release gate denied'
   using errcode='42501';end if;

 select * into v_old_receipt from apex_internal.supplier_review_upload_receipts r
 where r.store_id=p_store_id and r.request_id=p_request_id;
 if found then
  if v_old_receipt.actor_uid<>v_uid
     or v_old_receipt.submitted_changes<>p_changes
  then raise exception 'Conflicting review import request ID'
    using errcode='23505';end if;
  return v_old_receipt.outcome||
   jsonb_build_object('status','identical_import_replay');
 end if;

 for v_item in select value from jsonb_array_elements(p_changes) loop
  if jsonb_typeof(v_item)<>'object'
   or not (v_item ?& array[
    'order_id','row_kind','line_number','shipment_id','source_revision',
    'review_version','review_state','review_note'])
   or (select count(*) from jsonb_object_keys(v_item))<>8
   or jsonb_typeof(v_item->'order_id')<>'string'
   or (v_item->>'order_id') !~
     '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   or jsonb_typeof(v_item->'row_kind')<>'string'
   or v_item->>'row_kind' not in ('order_line','shipment_plan')
   or jsonb_typeof(v_item->'source_revision')<>'number'
   or (v_item->>'source_revision') !~ '^(0|[1-9][0-9]{0,3})$'
   or jsonb_typeof(v_item->'review_version')<>'number'
   or (v_item->>'review_version') !~ '^(0|[1-9][0-9]{0,4})$'
   or jsonb_typeof(v_item->'review_state')<>'string'
   or v_item->>'review_state' not in
    ('unreviewed','reviewed','needs_attention')
   or jsonb_typeof(v_item->'review_note')<>'string'
   or length(v_item->>'review_note')>240
   or (v_item->>'review_note') ~ '[[:cntrl:]]'
   or (v_item->>'review_note') ~ '@'
  then raise exception 'Invalid review annotation import row'
   using errcode='23514';end if;
  v_order:=(v_item->>'order_id')::uuid;
  v_kind:=v_item->>'row_kind';
  v_source_version:=(v_item->>'source_revision')::integer;
  v_review_version:=(v_item->>'review_version')::integer;
  v_state:=v_item->>'review_state';v_note:=v_item->>'review_note';
  if v_review_version>9999 then raise exception 'Review version over limit'
   using errcode='23514';end if;
  if v_kind='order_line' then
   if jsonb_typeof(v_item->'line_number')<>'number'
    or (v_item->>'line_number') !~ '^[1-9][0-9]?$'
    or jsonb_typeof(v_item->'shipment_id')<>'null'
    or v_source_version<>0
   then raise exception 'Order line edit identity malformed'
    using errcode='23514';end if;
   v_line:=(v_item->>'line_number')::integer;v_ship:=null;
   if not exists(select 1 from apex_internal.order_line_snapshots l
     where l.order_id=v_order and l.store_id=p_store_id
       and l.line_number=v_line and l.shipping_authorized=false)
   then raise exception 'Unknown or ineligible purchased line'
    using errcode='42501';end if;
   v_key:=v_order::text||':line:'||v_line::text;
  else
   if jsonb_typeof(v_item->'line_number')<>'null'
    or jsonb_typeof(v_item->'shipment_id')<>'string'
    or (v_item->>'shipment_id') !~
     '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or v_source_version<1
   then raise exception 'Shipment plan edit identity malformed'
    using errcode='23514';end if;
   v_ship:=(v_item->>'shipment_id')::uuid;v_line:=null;
   select * into v_plan from apex_internal.review_shipment_plans p
    where p.id=v_ship and p.store_id=p_store_id and p.order_id=v_order;
   if not found or v_plan.revision<>v_source_version
    or v_plan.plan_status<>'review_only'
    or v_plan.fulfillment_authorized<>false
    or v_plan.label_purchase_authorized<>false
   then raise exception 'Stale or unauthorized shipment plan'
    using errcode='40001';end if;
   v_key:=v_order::text||':plan:'||v_ship::text;
  end if;
  if v_key<=v_last_key then
   raise exception 'Rows must be ordered and unique' using errcode='23505';end if;
  v_last_key:=v_key;
  select * into v_header from apex_internal.order_detail_snapshots h
   where h.id=v_order and h.store_id=p_store_id;
  select * into v_account from apex_internal.held_order_intake_accounting a
   where a.order_id=v_order and a.store_id=p_store_id;
  if v_header.id is null or v_account.order_id is null
    or v_header.record_status<>'held_unverified'
    or v_header.fulfillment_authorized<>false
    or v_header.payment_authorized<>false
    or v_account.expected_line_count<1
    or v_account.expected_line_count<>(
      select count(*) from apex_internal.order_line_snapshots l
      where l.order_id=v_order and l.store_id=p_store_id)
    or v_account.line_subtotal_cents<>(
      select coalesce(sum(l.line_subtotal_cents),0)
      from apex_internal.order_line_snapshots l
      where l.order_id=v_order and l.store_id=p_store_id)
    or v_account.source_gross_cents<>v_header.source_gross_cents
    or not exists(select 1 from apex_internal.held_order_intake_audit a
      where a.order_id=v_order and a.store_id=p_store_id
       and a.event_type='snapshot_held'
       and a.source_sha256=v_header.source_event_sha256)
    or not exists(select 1 from apex_internal.order_delivery_envelopes d
      where d.order_id=v_order and d.store_id=p_store_id
       and d.shipping_authorized=false and d.delivery_verified=false)
   then raise exception 'Incomplete original held order'
     using errcode='42501';end if;

  select * into v_current from apex_internal.supplier_review_annotations a
   where a.store_id=p_store_id and a.row_key=v_key for update;
  v_processed:=v_processed+1;
  if not found then
   if v_review_version<>0 then
    raise exception 'Stale review annotation version'
    using errcode='40001';end if;
   if v_state='unreviewed' and v_note='' then
    v_unchanged:=v_unchanged+1;v_already:=v_already+1;
    continue;
   end if;
   insert into apex_internal.supplier_review_annotations(
    store_id,row_key,order_id,row_kind,review_state,review_note,
    review_version,updated_by)
   values(p_store_id,v_key,v_order,v_kind,v_state,v_note,1,v_uid);
   insert into apex_internal.supplier_review_annotation_audit(
    store_id,row_key,order_id,request_id,actor_uid,
    before_state,after_state,before_note,after_note,before_version,after_version)
   values(p_store_id,v_key,v_order,p_request_id,v_uid,
    'unreviewed',v_state,'',v_note,0,1);
   v_updated:=v_updated+1;
  elsif v_current.review_state=v_state and v_current.review_note=v_note then
   -- New request ID but identical target content: no duplicate audit/write.
   v_unchanged:=v_unchanged+1;v_already:=v_already+1;
  elsif v_current.review_version<>v_review_version then
   raise exception 'Stale review annotation version'
    using errcode='40001';
  else
   update apex_internal.supplier_review_annotations
   set review_state=v_state,review_note=v_note,
    review_version=review_version+1,updated_by=v_uid,
    updated_at=clock_timestamp()
   where store_id=p_store_id and row_key=v_key;
   insert into apex_internal.supplier_review_annotation_audit(
    store_id,row_key,order_id,request_id,actor_uid,
    before_state,after_state,before_note,after_note,before_version,after_version)
   values(p_store_id,v_key,v_order,p_request_id,v_uid,
    v_current.review_state,v_state,v_current.review_note,v_note,
    v_current.review_version,v_current.review_version+1);
   v_updated:=v_updated+1;
  end if;
 end loop;
 v_output:=jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,'status','applied',
  'processed',v_processed,'updated',v_updated,
  'unchanged',v_unchanged,'already_recorded',v_already,
  'order_created',false,'shipment_modified',false,
  'payment_modified',false,'shipping_modified',false);
 insert into apex_internal.supplier_review_upload_receipts(
  store_id,request_id,actor_uid,submitted_changes,outcome)
 values(p_store_id,p_request_id,v_uid,p_changes,v_output);
 return v_output;
end $fn$;

revoke all on function public.get_supplier_cumulative_review_annotations(uuid)
 from public,anon,authenticated;
grant execute on function public.get_supplier_cumulative_review_annotations(uuid)
 to authenticated;
revoke all on function public.apply_supplier_cumulative_review_annotations(
 uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_supplier_cumulative_review_annotations(
 uuid,uuid,jsonb) to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.apply_supplier_cumulative_review_annotations(uuid,uuid,jsonb)','EXECUTE')
 or has_function_privilege('anon',
   'public.get_supplier_cumulative_review_annotations(uuid)','EXECUTE')
 or has_table_privilege('authenticated',
   'apex_internal.supplier_review_annotations','SELECT')
 or has_table_privilege('authenticated',
   'apex_internal.supplier_review_annotation_audit','INSERT')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review annotation privacy postflight failed';end if;
end $postflight$;
commit;
