-- Issue #215 Phase 1: disposable shipment planning + tracking-DRAFT ledger.
-- NEVER add to supabase/migrations. No live shipment, carrier, label, payment,
-- destination decrypt or supplier-facing mutation surface is created.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or to_regclass('apex_internal.order_detail_snapshots') is null
  or to_regclass('apex_internal.order_line_snapshots') is null
  or to_regclass('apex_internal.held_order_intake_accounting') is null
  or to_regclass('apex_internal.held_order_intake_audit') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Review shipment ledger requires gated disposable apex_test';end if;
end $preflight$;

begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table apex_internal.review_shipment_plans (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 order_id uuid not null,
 client_shipment_reference text not null
  check(client_shipment_reference ~ '^[A-Za-z0-9._:-]{1,100}$'),
 revision integer not null default 1 check(revision between 1 and 1000),
 plan_status text not null default 'review_only'
  check(plan_status='review_only'),
 fulfillment_authorized boolean not null default false
  check(fulfillment_authorized=false),
 label_purchase_authorized boolean not null default false
  check(label_purchase_authorized=false),
 created_at timestamptz not null default clock_timestamp(),
 unique(store_id,order_id,client_shipment_reference),
 unique(id,store_id,order_id),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id)
  on delete restrict
);
create table apex_internal.review_shipment_allocations (
 shipment_id uuid not null,
 store_id uuid not null,
 order_id uuid not null,
 order_line_id uuid not null,
 planned_quantity integer not null check(planned_quantity between 1 and 100),
 primary key(shipment_id,order_line_id),
 foreign key(shipment_id,store_id,order_id)
  references apex_internal.review_shipment_plans(id,store_id,order_id)
  on delete restrict,
 foreign key(order_line_id) references apex_internal.order_line_snapshots(id)
  on delete restrict
);
create table apex_internal.review_shipment_events (
 id bigint generated always as identity primary key,
 shipment_id uuid not null,
 store_id uuid not null,
 order_id uuid not null,
 event_key uuid not null,
 revision integer not null check(revision between 1 and 1000),
 event_kind text not null check(event_kind in ('plan_recorded','tracking_draft_recorded')),
 carrier text check(carrier in ('USPS','UPS','FEDEX','DHL')),
 tracking_reference text check(tracking_reference ~ '^[A-Z0-9]{8,40}$'),
 actor_identity text not null default 'disposable_review_admin'
  check(actor_identity='disposable_review_admin'),
 occurred_at timestamptz not null default clock_timestamp(),
 unique(store_id,event_key),
 unique(shipment_id,revision),
 foreign key(shipment_id,store_id,order_id)
  references apex_internal.review_shipment_plans(id,store_id,order_id)
  on delete restrict,
 check(
  (event_kind='plan_recorded' and revision=1 and carrier is null and tracking_reference is null)
  or
  (event_kind='tracking_draft_recorded' and revision>=2 and carrier is not null and tracking_reference is not null)
 )
);
-- Draft tracking numbers cannot silently be claimed by another shipment in
-- the same supplier. Real carrier ownership is NOT proven by this constraint.
create unique index review_shipment_tracking_draft_unique_idx
 on apex_internal.review_shipment_events(store_id,carrier,tracking_reference)
 where tracking_reference is not null;

create trigger review_shipment_allocation_immutable
 before update or delete on apex_internal.review_shipment_allocations
 for each row execute function apex_internal.deny_order_detail_mutation();
create trigger review_shipment_event_immutable
 before update or delete on apex_internal.review_shipment_events
 for each row execute function apex_internal.deny_order_detail_mutation();
create function apex_internal.block_review_shipment_plan_identity_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $fn$
begin
 if tg_op='DELETE'
 or new.id is distinct from old.id
 or new.store_id is distinct from old.store_id
 or new.order_id is distinct from old.order_id
 or new.client_shipment_reference is distinct from old.client_shipment_reference
 or new.plan_status is distinct from old.plan_status
 or new.fulfillment_authorized is distinct from old.fulfillment_authorized
 or new.label_purchase_authorized is distinct from old.label_purchase_authorized
 or new.created_at is distinct from old.created_at
 or new.revision is distinct from old.revision+1
 then raise exception 'Shipment identity, shipment state or revision mutation denied'
  using errcode='55000';end if;
 return new;
end $fn$;
create trigger review_shipment_plan_identity_protect
 before update or delete on apex_internal.review_shipment_plans
 for each row execute function apex_internal.block_review_shipment_plan_identity_mutation();

alter table apex_internal.review_shipment_plans enable row level security;
alter table apex_internal.review_shipment_plans force row level security;
alter table apex_internal.review_shipment_allocations enable row level security;
alter table apex_internal.review_shipment_allocations force row level security;
alter table apex_internal.review_shipment_events enable row level security;
alter table apex_internal.review_shipment_events force row level security;
revoke all on apex_internal.review_shipment_plans,
 apex_internal.review_shipment_allocations,
 apex_internal.review_shipment_events from public,anon,authenticated;
do $service$
begin
 if to_regrole('service_role') is not null then
  execute 'revoke all on apex_internal.review_shipment_plans, apex_internal.review_shipment_allocations, apex_internal.review_shipment_events from service_role';
 end if;
end $service$;

-- Private, SECURITY INVOKER, disposable admin ONLY. It creates a *plan*,
-- never a shipment, shipping authorization or inventory reservation.
create function apex_internal.create_review_shipment_plan(
 p_store uuid,p_order uuid,p_reference text,p_allocations jsonb,p_event_key uuid)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v_order apex_internal.order_detail_snapshots%rowtype;
 v_account apex_internal.held_order_intake_accounting%rowtype;
 v_old apex_internal.review_shipment_plans%rowtype;
 v_prior_event apex_internal.review_shipment_events%rowtype;
 v_line jsonb;
 v_line_id uuid;
 v_qty integer;
 v_old_line uuid;
 v_count integer:=0;
 v_prev_qty integer:=0;
 v_new_qty integer;
 v_ref_cursor text:='';
 v_shipment uuid;
 v_old_allocations jsonb;
begin
 if current_database()<>'apex_test' or p_store is null or p_order is null
  or p_event_key is null or p_reference is null
  or p_reference !~ '^[A-Za-z0-9._:-]{1,100}$'
  or p_allocations is null or jsonb_typeof(p_allocations)<>'array'
  or jsonb_array_length(p_allocations) not between 1 and 50
 then raise exception 'Review-only shipment input denied' using errcode='23514';end if;
 perform 1 from apex_internal.private_release_gate where singleton and enabled=false for share;
 if not found then raise exception 'Shipment gate denied' using errcode='42501';end if;
 select * into v_order from apex_internal.order_detail_snapshots
  where store_id=p_store and id=p_order for update;
 if not found or v_order.record_status<>'held_unverified'
  or v_order.fulfillment_authorized<>false
  or v_order.payment_authorized<>false
 then raise exception 'Canonical held order unavailable' using errcode='42501';end if;
 select * into v_account from apex_internal.held_order_intake_accounting
  where store_id=p_store and order_id=p_order;
 if not found or v_account.expected_line_count<>(
   select count(*) from apex_internal.order_line_snapshots
   where order_id=p_order and store_id=p_store)
  or v_account.expected_line_count<1
  or v_account.line_subtotal_cents<>(
   select sum(line_subtotal_cents) from apex_internal.order_line_snapshots
   where order_id=p_order and store_id=p_store)
  or v_account.source_gross_cents<>v_order.source_gross_cents
  or not exists(select 1 from apex_internal.order_delivery_envelopes d
   where d.order_id=p_order and d.store_id=p_store
    and d.shipping_authorized=false and d.delivery_verified=false)
  or not exists(select 1 from apex_internal.held_order_intake_audit a
   where a.order_id=p_order and a.store_id=p_store
   and a.event_type='snapshot_held'
   and a.source_sha256=v_order.source_event_sha256)
 then raise exception 'Incomplete held source cannot be planned' using errcode='23514';end if;

 -- Canonical ordered allocation array prevents altered/doubled line IDs.
 for v_line in select value from jsonb_array_elements(p_allocations) loop
  if jsonb_typeof(v_line)<>'object'
   or not (v_line ?& array['order_line_id','quantity'])
   or (select count(*) from jsonb_object_keys(v_line))<>2
   or (v_line->>'order_line_id') is null
   or (v_line->>'quantity') is null
   or (v_line->>'quantity') !~ '^[1-9][0-9]{0,2}$'
  then raise exception 'Invalid planned shipment allocations'
   using errcode='23514';end if;
  v_line_id:=(v_line->>'order_line_id')::uuid;
  v_qty:=(v_line->>'quantity')::integer;
  if v_qty not between 1 and 100 or v_line_id::text<=v_ref_cursor then
   raise exception 'Unordered, duplicate or invalid planned line'
    using errcode='23514';end if;
  v_ref_cursor:=v_line_id::text;
  select quantity into v_new_qty
    from apex_internal.order_line_snapshots
    where id=v_line_id and store_id=p_store and order_id=p_order
     and product_eligibility='not_verified'
     and shipping_authorized=false;
  if not found then raise exception 'Line does not belong to held order'
   using errcode='42501';end if;
  v_count:=v_count+1;
 end loop;
 select * into v_prior_event from apex_internal.review_shipment_events e
 where e.store_id=p_store and e.event_key=p_event_key;
 if found then
   select * into v_old from apex_internal.review_shipment_plans
    where id=v_prior_event.shipment_id and store_id=p_store and order_id=p_order
     and client_shipment_reference=p_reference;
   if not found or v_prior_event.event_kind<>'plan_recorded' then
    raise exception 'Conflicting shipment event replay' using errcode='23505';end if;
   select coalesce(jsonb_agg(jsonb_build_object(
    'order_line_id',a.order_line_id,'quantity',a.planned_quantity)
     order by a.order_line_id::text),'[]'::jsonb)
    into v_old_allocations
   from apex_internal.review_shipment_allocations a
   where a.shipment_id=v_old.id and a.store_id=p_store and a.order_id=p_order;
   if v_old_allocations<>p_allocations then
    raise exception 'Changed allocation replay denied' using errcode='23505';end if;
   return jsonb_build_object('status','identical_plan_replay',
    'shipment_id',v_old.id,'revision',v_old.revision,'shipping_authorized',false);
 end if;
 if exists(select 1 from apex_internal.review_shipment_plans
    where store_id=p_store and order_id=p_order
     and client_shipment_reference=p_reference)
 then raise exception 'Shipment reference already claimed by different event'
  using errcode='23505';end if;

 -- Each plan consumes portions of the original purchased quantity for
 -- PLANNING ONLY. Locking canonical held order serializes competing plans.
 for v_line in select value from jsonb_array_elements(p_allocations) loop
  v_line_id:=(v_line->>'order_line_id')::uuid;
  v_qty:=(v_line->>'quantity')::integer;
  select l.quantity into v_new_qty from apex_internal.order_line_snapshots l
   where l.id=v_line_id and l.store_id=p_store and l.order_id=p_order;
  select coalesce(sum(a.planned_quantity),0)::integer into v_prev_qty
  from apex_internal.review_shipment_allocations a
  where a.store_id=p_store and a.order_id=p_order and a.order_line_id=v_line_id;
  if v_prev_qty+v_qty>v_new_qty then
   raise exception 'Shipment plans exceed immutable purchased quantity'
    using errcode='23514';end if;
 end loop;
 insert into apex_internal.review_shipment_plans(
  store_id,order_id,client_shipment_reference)
 values(p_store,p_order,p_reference) returning id into v_shipment;
 for v_line in select value from jsonb_array_elements(p_allocations) loop
  insert into apex_internal.review_shipment_allocations(
    shipment_id,store_id,order_id,order_line_id,planned_quantity)
  values(v_shipment,p_store,p_order,(v_line->>'order_line_id')::uuid,
    (v_line->>'quantity')::integer);
 end loop;
 insert into apex_internal.review_shipment_events(
  shipment_id,store_id,order_id,event_key,revision,event_kind)
 values(v_shipment,p_store,p_order,p_event_key,1,'plan_recorded');
 return jsonb_build_object('status','plan_recorded','shipment_id',v_shipment,
  'revision',1,'shipping_authorized',false,'shipment_created',false);
end $fn$;

-- Tracking proposals are audit-only DRAFTS. Revision checks are atomic,
-- and a repeated event ID cannot duplicate a tracking claim or mutate state.
create function apex_internal.record_review_tracking_draft(
 p_store uuid,p_shipment uuid,p_event_key uuid,p_expected_revision integer,
 p_carrier text,p_tracking text)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v_plan apex_internal.review_shipment_plans%rowtype;
 v_old apex_internal.review_shipment_events%rowtype;
 v_new_revision integer;
begin
 if current_database()<>'apex_test' or p_store is null
  or p_shipment is null or p_event_key is null
  or p_expected_revision is null or p_expected_revision not between 1 and 999
  or p_carrier is null or p_carrier not in ('USPS','UPS','FEDEX','DHL')
  or p_tracking is null or p_tracking !~ '^[A-Z0-9]{8,40}$'
 then raise exception 'Invalid tracking draft input' using errcode='23514';end if;
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Tracking release gate denied'
  using errcode='42501';end if;
 select * into v_plan from apex_internal.review_shipment_plans
  where id=p_shipment and store_id=p_store for update;
 if not found or v_plan.plan_status<>'review_only'
    or v_plan.fulfillment_authorized<>false
    or v_plan.label_purchase_authorized<>false
 then raise exception 'Review shipment not authorized' using errcode='42501';end if;
 select * into v_old from apex_internal.review_shipment_events
 where store_id=p_store and event_key=p_event_key;
 if found then
  if v_old.shipment_id<>p_shipment or v_old.event_kind<>'tracking_draft_recorded'
   or v_old.carrier<>p_carrier or v_old.tracking_reference<>p_tracking
   or v_old.revision<>p_expected_revision+1
  then raise exception 'Conflicting tracking event replay' using errcode='23505';end if;
  return jsonb_build_object('status','identical_tracking_draft_replay',
    'shipment_id',p_shipment,'revision',v_plan.revision,'shipped',false);
 end if;
 if v_plan.revision<>p_expected_revision then
  raise exception 'Stale shipment revision (refresh before editing)'
   using errcode='40001';end if;
 v_new_revision:=v_plan.revision+1;
 update apex_internal.review_shipment_plans
 set revision=v_new_revision where id=p_shipment and store_id=p_store;
 insert into apex_internal.review_shipment_events(
  shipment_id,store_id,order_id,event_key,revision,event_kind,
  carrier,tracking_reference)
 values(p_shipment,p_store,v_plan.order_id,p_event_key,v_new_revision,
  'tracking_draft_recorded',p_carrier,p_tracking);
 return jsonb_build_object('status','tracking_draft_recorded',
  'shipment_id',p_shipment,'revision',v_new_revision,
  'shipped',false,'carrier_verified',false,'label_purchased',false);
end $fn$;

revoke all on function apex_internal.create_review_shipment_plan(
 uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function apex_internal.record_review_tracking_draft(
 uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
do $postflight$
begin
 if has_function_privilege('authenticated',
 'apex_internal.create_review_shipment_plan(uuid,uuid,text,jsonb,uuid)','EXECUTE')
 or has_function_privilege('anon',
 'apex_internal.record_review_tracking_draft(uuid,uuid,uuid,integer,text,text)','EXECUTE')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Shipment review privacy postflight failed';end if;
end $postflight$;
commit;
