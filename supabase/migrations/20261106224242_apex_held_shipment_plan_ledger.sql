-- Issue #215. Durable review plans for original held orders only.
-- An independently authorized shipment workflow must use a separate contract.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if to_regprocedure('public.get_supplier_held_order_record(uuid,uuid)') is null
  or to_regprocedure('public.get_supplier_held_order_lines(uuid,uuid)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
      is distinct from false
  or has_schema_privilege('authenticated', 'apex_internal', 'USAGE')
  or has_schema_privilege('anon', 'apex_internal', 'USAGE')
 then raise exception 'Held shipment plan preflight denied'; end if;
end $preflight$;

create type apex_internal.shipment_plan_state as enum (
 'queued', 'under_review', 'packing', 'label_ready',
 'shipped', 'delivered', 'exception', 'cancelled'
);

-- This row is a write fence, not another order record. Every new command
-- updates it so a stale repeatable-read/serializable snapshot must retry.
create table apex_internal.held_shipment_plan_revisions (
 order_id uuid primary key,
 store_id uuid not null,
 supplier_id uuid not null,
 revision integer not null default 0 check (revision >= 0),
 foreign key (order_id, store_id) references apex_internal.order_detail_snapshots (id, store_id),
 foreign key (store_id, supplier_id) references public.stores (id, supplier_id),
 unique (order_id, store_id)
);

create table apex_internal.held_shipment_plans (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 store_id uuid not null,
 state apex_internal.shipment_plan_state not null
  check (state in ('queued', 'under_review', 'exception', 'cancelled')),
 revision integer not null check (revision > 0),
 created_at timestamptz not null default clock_timestamp(),
 foreign key (order_id, store_id) references apex_internal.held_shipment_plan_revisions (order_id, store_id),
 unique (id, order_id, store_id)
);
create index held_shipment_plans_order_history_idx
 on apex_internal.held_shipment_plans (order_id, store_id, created_at desc, id desc);

alter table apex_internal.order_line_snapshots
 add constraint held_shipment_original_line_identity unique (order_id, store_id, id);

create table apex_internal.held_shipment_plan_allocations (
 shipment_id uuid not null,
 order_id uuid not null,
 store_id uuid not null,
 line_id uuid not null,
 quantity integer not null check (quantity between 1 and 100),
 primary key (shipment_id, line_id),
 foreign key (shipment_id, order_id, store_id)
  references apex_internal.held_shipment_plans (id, order_id, store_id),
 foreign key (order_id, store_id, line_id)
  references apex_internal.order_line_snapshots (order_id, store_id, id)
);
create index held_shipment_plan_allocations_order_idx
 on apex_internal.held_shipment_plan_allocations (order_id, store_id, line_id);

create function apex_internal.held_shipment_transition_allowed(
 p_from apex_internal.shipment_plan_state, p_to apex_internal.shipment_plan_state, p_reason text
) returns boolean language sql immutable set search_path = pg_catalog
return coalesce(case
 when p_from is null and p_to = 'queued' then p_reason = 'plan_created'
 when p_from = 'queued' and p_to = 'under_review' then p_reason = 'review_started'
 when p_from = 'under_review' and p_to = 'exception' then p_reason = 'review_issue'
 when p_from = 'exception' and p_to = 'under_review' then p_reason = 'review_reopened'
 when p_from in ('queued', 'under_review', 'exception') and p_to = 'cancelled'
  then p_reason in ('quantity_correction', 'plan_no_longer_needed')
end, false);

create table apex_internal.held_shipment_plan_events (
 shipment_id uuid not null,
 order_id uuid not null,
 store_id uuid not null,
 revision integer not null check (revision > 0),
 request_id uuid not null,
 actor_id uuid not null,
 from_state apex_internal.shipment_plan_state,
 to_state apex_internal.shipment_plan_state not null,
 reason text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 primary key (shipment_id, revision),
 unique (store_id, request_id),
 foreign key (shipment_id, order_id, store_id)
  references apex_internal.held_shipment_plans (id, order_id, store_id),
 check ((revision = 1) = (from_state is null)),
 check (apex_internal.held_shipment_transition_allowed(from_state, to_state, reason))
);
comment on table apex_internal.held_shipment_plan_events is
 'Append-only supplier review history. Revision 1 owns the plan creation idempotency key. No event confers shipping authority.';

create function apex_internal.deny_held_shipment_history_mutation()
 returns trigger language plpgsql set search_path = pg_catalog as $fn$
begin
 raise exception 'Shipment plan allocations and history are immutable' using errcode = '55000';
end $fn$;
create trigger held_shipment_plan_allocations_immutable
 before update or delete on apex_internal.held_shipment_plan_allocations
 for each row execute function apex_internal.deny_held_shipment_history_mutation();
create trigger held_shipment_plan_events_immutable
 before update or delete on apex_internal.held_shipment_plan_events
 for each row execute function apex_internal.deny_held_shipment_history_mutation();

alter table apex_internal.held_shipment_plan_revisions enable row level security;
alter table apex_internal.held_shipment_plan_revisions force row level security;
alter table apex_internal.held_shipment_plans enable row level security;
alter table apex_internal.held_shipment_plans force row level security;
alter table apex_internal.held_shipment_plan_allocations enable row level security;
alter table apex_internal.held_shipment_plan_allocations force row level security;
alter table apex_internal.held_shipment_plan_events enable row level security;
alter table apex_internal.held_shipment_plan_events force row level security;
revoke all on apex_internal.held_shipment_plan_revisions, apex_internal.held_shipment_plans,
 apex_internal.held_shipment_plan_allocations, apex_internal.held_shipment_plan_events
 from public, anon, authenticated;

create function apex_internal.require_held_shipment_plan_supplier(p_store_id uuid, p_order_id uuid)
 returns uuid language plpgsql stable set search_path = pg_catalog as $fn$
declare
 v_uid uuid := (select auth.uid());
 v_supplier_id uuid;
begin
 if v_uid is null or coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'true'
 then raise exception 'held_shipment_plan_access_denied' using errcode = '42501'; end if;

 select s.supplier_id into v_supplier_id
 from public.stores s
 join public.supplier_memberships m on m.supplier_id = s.supplier_id
 join auth.users u on u.id = m.user_id
 where s.id = p_store_id and m.user_id = v_uid and m.role in ('owner', 'manager')
  and u.email_confirmed_at is not null;
 if not found then
  raise exception 'held_shipment_plan_access_denied' using errcode = '42501';
 end if;
 -- Reuse original held-order reconciliation, including its release-gate check.
 if public.get_supplier_held_order_record(p_store_id, p_order_id) is null then
  raise exception 'held_shipment_plan_access_denied' using errcode = '42501';
 end if;
 return v_supplier_id;
end $fn$;

create function apex_internal.held_shipment_plan_balance(p_store_id uuid, p_order_id uuid)
 returns table (line_id uuid, purchased_quantity integer, planned_quantity integer)
 language sql stable set search_path = pg_catalog
begin atomic
 select l.id, l.quantity, coalesce(a.planned, 0)::integer
 from apex_internal.order_line_snapshots l
 left join (
  select a.line_id, sum(a.quantity) as planned
  from apex_internal.held_shipment_plan_allocations a
  join apex_internal.held_shipment_plans s on s.id = a.shipment_id and s.state <> 'cancelled'
  where a.order_id = p_order_id and a.store_id = p_store_id
  group by a.line_id
 ) a on a.line_id = l.id
 where l.order_id = p_order_id and l.store_id = p_store_id;
end;

create function apex_internal.read_held_shipment_plans_v1(p_store_id uuid, p_order_id uuid, p_page integer)
 returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
 perform apex_internal.require_held_shipment_plan_supplier(p_store_id, p_order_id);
 if p_page is null or p_page not between 0 and 10000 then
  raise exception 'invalid_shipment_plan_page' using errcode = '22023';
 end if;

 return (
  with plan_page as (
   select s.* from apex_internal.held_shipment_plans s
   where s.order_id = p_order_id and s.store_id = p_store_id
   order by s.created_at desc, s.id desc limit 11 offset p_page * 10
  ), visible_plans as (
   select s.* from plan_page s order by s.created_at desc, s.id desc limit 10
  )
  select jsonb_build_object(
   'schema_version', 1, 'scope', 'held_review', 'shipping_enabled', false,
   'store_id', p_store_id, 'order_id', p_order_id, 'page', p_page,
   'has_more', (select count(*) > 10 from plan_page),
   'review_revision', coalesce((select r.revision from apex_internal.held_shipment_plan_revisions r
     where r.order_id = p_order_id and r.store_id = p_store_id), 0),
   'lines', (select coalesce(jsonb_agg(to_jsonb(b) order by b.line_id), '[]'::jsonb)
     from apex_internal.held_shipment_plan_balance(p_store_id, p_order_id) b),
   'plans', (select coalesce(jsonb_agg(jsonb_build_object(
    'shipment_id', s.id, 'state', s.state, 'revision', s.revision,
    'allocations', (select jsonb_agg(jsonb_build_object('line_id', a.line_id, 'quantity', a.quantity) order by a.line_id)
      from apex_internal.held_shipment_plan_allocations a where a.shipment_id = s.id),
    'events', (select jsonb_agg(jsonb_build_object(
      'revision', e.revision, 'actor_id', e.actor_id, 'from_state', e.from_state,
      'to_state', e.to_state, 'reason', e.reason, 'occurred_at',
      to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     ) order by e.revision desc) from (
      select * from apex_internal.held_shipment_plan_events e where e.shipment_id = s.id
      order by e.revision desc limit 10
     ) e)
   ) order by s.created_at desc, s.id desc), '[]'::jsonb) from visible_plans s)
  )
 );
end $fn$;

create function apex_internal.write_held_shipment_plan_v1(
 p_store_id uuid, p_order_id uuid, p_request_id uuid, p_shipment_id uuid,
 p_expected_revision integer, p_to_state text, p_allocations jsonb, p_reason text
) returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $fn$
declare
 v_supplier_id uuid;
 v_actor_id uuid := (select auth.uid());
 v_plan apex_internal.held_shipment_plans%rowtype;
 v_event apex_internal.held_shipment_plan_events%rowtype;
 v_from apex_internal.shipment_plan_state;
 v_to apex_internal.shipment_plan_state;
 v_reason text;
 v_entry jsonb;
 v_allocations jsonb;
 v_replayed boolean;
begin
 v_supplier_id := apex_internal.require_held_shipment_plan_supplier(p_store_id, p_order_id);
 if p_request_id is null then
  raise exception 'invalid_shipment_plan_request' using errcode = '22023';
 end if;
 if p_shipment_id is null then
  if p_expected_revision is not null or p_to_state is not null or p_reason is not null
   or jsonb_typeof(p_allocations) is distinct from 'array' then
   raise exception 'invalid_shipment_plan_request' using errcode = '22023';
  end if;
  if jsonb_array_length(p_allocations) not between 1 and 50 then
   raise exception 'invalid_shipment_plan_allocations' using errcode = '22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_allocations) loop
   if jsonb_typeof(v_entry) is distinct from 'object' then
    raise exception 'invalid_shipment_plan_allocations' using errcode = '22023';
   end if;
   if v_entry - 'line_id' - 'quantity' <> '{}'::jsonb
    or jsonb_typeof(v_entry->'line_id') is distinct from 'string'
    or (v_entry->>'line_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(v_entry->'quantity') is distinct from 'number'
    or (v_entry->>'quantity') !~ '^([1-9][0-9]?|100)$' then
    raise exception 'invalid_shipment_plan_allocations' using errcode = '22023';
   end if;
  end loop;
  select jsonb_agg(jsonb_build_object('line_id', a.line_id, 'quantity', a.quantity) order by a.line_id)
   into v_allocations from jsonb_to_recordset(p_allocations) a(line_id uuid, quantity integer);
  if (select count(distinct a.line_id) from jsonb_to_recordset(v_allocations) a(line_id uuid))
   <> jsonb_array_length(v_allocations) then
   raise exception 'invalid_shipment_plan_allocations' using errcode = '22023';
  end if;
  v_to := 'queued';
  v_reason := 'plan_created';
 else
  if p_to_state in ('packing', 'label_ready', 'shipped', 'delivered') then
   raise exception 'operational_shipment_disabled' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 or p_allocations is not null or p_reason is null
   or p_to_state is null or p_to_state not in ('queued', 'under_review', 'exception', 'cancelled') then
   raise exception 'invalid_shipment_plan_request' using errcode = '22023';
  end if;
  v_to := p_to_state::apex_internal.shipment_plan_state;
  v_reason := p_reason;
 end if;

 -- Serialize capacity checks, plan transitions, and releases on the same order.
 insert into apex_internal.held_shipment_plan_revisions (order_id, store_id, supplier_id)
 values (p_order_id, p_store_id, v_supplier_id) on conflict (order_id) do nothing;
 perform 1 from apex_internal.held_shipment_plan_revisions r
 where r.order_id = p_order_id and r.store_id = p_store_id and r.supplier_id = v_supplier_id
 for update;
 if not found then
  raise exception 'held_shipment_plan_access_denied' using errcode = '42501';
 end if;
 -- Recheck authorization after a potential wait behind another command.
 if apex_internal.require_held_shipment_plan_supplier(p_store_id, p_order_id) <> v_supplier_id then
  raise exception 'held_shipment_plan_access_denied' using errcode = '42501';
 end if;

 select * into v_event from apex_internal.held_shipment_plan_events e
 where e.store_id = p_store_id and e.request_id = p_request_id;
 v_replayed := found;
 if v_replayed then
  if v_event.order_id <> p_order_id or v_event.actor_id <> v_actor_id
   or v_event.to_state <> v_to or v_event.reason <> v_reason
   or (case when p_shipment_id is null then
    v_event.revision <> 1 or v_allocations is distinct from (
     select jsonb_agg(jsonb_build_object('line_id', a.line_id, 'quantity', a.quantity) order by a.line_id)
     from apex_internal.held_shipment_plan_allocations a where a.shipment_id = v_event.shipment_id
    )
   else v_event.shipment_id <> p_shipment_id or v_event.revision - 1 <> p_expected_revision
   end) then
   raise exception 'shipment_plan_request_conflict' using errcode = 'PT409';
  end if;
 else
  if p_shipment_id is null then
   if exists (
    select 1 from jsonb_to_recordset(v_allocations) a(line_id uuid)
    left join apex_internal.order_line_snapshots l on l.id = a.line_id
     and l.order_id = p_order_id and l.store_id = p_store_id where l.id is null
   ) then raise exception 'shipment_plan_line_not_in_order' using errcode = '22023'; end if;
   if exists (
    select 1 from jsonb_to_recordset(v_allocations) a(line_id uuid, quantity integer)
    join apex_internal.held_shipment_plan_balance(p_store_id, p_order_id) b using (line_id)
    where a.quantity > b.purchased_quantity - b.planned_quantity
   ) then raise exception 'shipment_plan_quantity_conflict' using errcode = 'PT409'; end if;

   insert into apex_internal.held_shipment_plans (order_id, store_id, state, revision)
   values (p_order_id, p_store_id, v_to, 1) returning * into v_plan;
   insert into apex_internal.held_shipment_plan_allocations (shipment_id, order_id, store_id, line_id, quantity)
   select v_plan.id, p_order_id, p_store_id, a.line_id, a.quantity
   from jsonb_to_recordset(v_allocations) a(line_id uuid, quantity integer);
  else
   select * into v_plan from apex_internal.held_shipment_plans s
   where s.id = p_shipment_id and s.order_id = p_order_id and s.store_id = p_store_id;
   if not found then
    raise exception 'held_shipment_plan_access_denied' using errcode = '42501';
   end if;
   if v_plan.revision <> p_expected_revision then
    raise exception 'shipment_plan_revision_conflict' using errcode = 'PT409',
     detail = format('Current plan revision is %s', v_plan.revision);
   end if;
   v_from := v_plan.state;
   if not apex_internal.held_shipment_transition_allowed(v_from, v_to, v_reason) then
    raise exception 'invalid_shipment_plan_transition' using errcode = '22023';
   end if;
   update apex_internal.held_shipment_plans set state = v_to, revision = revision + 1
   where id = v_plan.id returning * into v_plan;
  end if;

  insert into apex_internal.held_shipment_plan_events
   (shipment_id, order_id, store_id, revision, request_id, actor_id, from_state, to_state, reason)
  values (v_plan.id, p_order_id, p_store_id, v_plan.revision, p_request_id, v_actor_id, v_from, v_to, v_reason)
  on conflict (store_id, request_id) do nothing returning * into v_event;
  -- Different orders use different fences, but share a store-level key space.
  if not found then
   raise exception 'shipment_plan_request_conflict' using errcode = 'PT409';
  end if;
  update apex_internal.held_shipment_plan_revisions set revision = revision + 1
  where order_id = p_order_id;
 end if;

 return jsonb_build_object('schema_version', 1, 'scope', 'held_review',
  'store_id', p_store_id, 'order_id', p_order_id, 'request_id', p_request_id,
  'shipment_id', v_event.shipment_id, 'revision', v_event.revision, 'replayed', v_replayed);
end $fn$;

-- Parsed SQL wrappers can reference the private implementations by OID with
-- no schema USAGE for API roles. The exposed functions run as invoker.
create function public.get_supplier_held_shipment_plans_v1(p_store_id uuid, p_order_id uuid, p_page integer)
 returns jsonb language sql stable security invoker set search_path = pg_catalog
return apex_internal.read_held_shipment_plans_v1(p_store_id, p_order_id, p_page);

create function public.save_supplier_held_shipment_plan_v1(
 p_store_id uuid, p_order_id uuid, p_request_id uuid, p_shipment_id uuid,
 p_expected_revision integer, p_to_state text, p_allocations jsonb, p_reason text
) returns jsonb language sql volatile security invoker set search_path = pg_catalog
return apex_internal.write_held_shipment_plan_v1(
 p_store_id, p_order_id, p_request_id, p_shipment_id, p_expected_revision, p_to_state, p_allocations, p_reason
);

revoke all on function
 apex_internal.deny_held_shipment_history_mutation(),
 apex_internal.held_shipment_transition_allowed(apex_internal.shipment_plan_state, apex_internal.shipment_plan_state, text),
 apex_internal.require_held_shipment_plan_supplier(uuid, uuid),
 apex_internal.held_shipment_plan_balance(uuid, uuid),
 apex_internal.read_held_shipment_plans_v1(uuid, uuid, integer),
 apex_internal.write_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text),
 public.get_supplier_held_shipment_plans_v1(uuid, uuid, integer),
 public.save_supplier_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text)
 from public, anon, authenticated;
grant execute on function
 apex_internal.read_held_shipment_plans_v1(uuid, uuid, integer),
 apex_internal.write_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text),
 public.get_supplier_held_shipment_plans_v1(uuid, uuid, integer),
 public.save_supplier_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text)
 to authenticated;

do $permissions$
begin
 if to_regrole('service_role') is not null then
  revoke all on apex_internal.held_shipment_plan_revisions, apex_internal.held_shipment_plans,
   apex_internal.held_shipment_plan_allocations, apex_internal.held_shipment_plan_events from service_role;
  revoke all on function
   apex_internal.read_held_shipment_plans_v1(uuid, uuid, integer),
   apex_internal.write_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text),
   public.get_supplier_held_shipment_plans_v1(uuid, uuid, integer),
   public.save_supplier_held_shipment_plan_v1(uuid, uuid, uuid, uuid, integer, text, jsonb, text)
   from service_role;
 end if;
end $permissions$;
commit;
