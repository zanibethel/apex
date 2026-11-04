-- Issue #214 phase 6: disposable-only immutable source receipt + recovery journal.
-- Deliberately NOT in supabase/migrations and never an exposed API endpoint.
-- No permit creation, actual source authentication, order writes or shipping.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
    or to_regclass('apex_internal.order_detail_snapshots') is null
    or to_regclass('apex_internal.held_order_intake_accounting') is null
    or (select enabled from apex_internal.private_release_gate where singleton)
       is distinct from false
 then raise exception 'Order source journal requires disposable, gated database';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Locks one canonical immutable source hash to one historical sale. A second
-- independently identified delivery with the same hash is permitted; a
-- changed source payload for the same sale is a conflict, never a replacement.
create table apex_internal.held_order_source_claims (
 store_id uuid not null references public.stores(id) on delete restrict,
 sale_id uuid not null references public.supplier_sales_history(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(store_id,sale_id),
 unique(store_id,sale_id,source_sha256)
);
create trigger apex_order_source_claim_immutable
 before update or delete on apex_internal.held_order_source_claims
 for each row execute function apex_internal.deny_order_detail_mutation();

create table apex_internal.held_order_source_deliveries (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 sale_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_kind text not null default 'synthetic_ci_unverified'
   check(source_kind='synthetic_ci_unverified'),
 delivery_reference text not null
   check(delivery_reference ~ '^[A-Za-z0-9._:-]{1,100}$'),
 first_seen_at timestamptz not null default clock_timestamp(),
 unique(store_id,source_kind,delivery_reference),
 foreign key(store_id,sale_id,source_sha256)
   references apex_internal.held_order_source_claims(
     store_id,sale_id,source_sha256) on delete restrict
);
create trigger apex_order_source_delivery_immutable
 before update or delete on apex_internal.held_order_source_deliveries
 for each row execute function apex_internal.deny_order_detail_mutation();

-- Event types describe OBSERVATIONS, not payment/fulfillment authorization.
-- No mutable status flags; reconstruct progress from append-only observations.
create table apex_internal.held_order_source_recovery_events (
 id bigint generated always as identity primary key,
 delivery_id uuid not null references apex_internal.held_order_source_deliveries(id)
  on delete restrict,
 event_type text not null check(event_type in (
   'unverified_received','held_snapshot_readback','source_conflict_review')),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(delivery_id,event_type)
);
create trigger apex_order_source_recovery_event_immutable
 before update or delete on apex_internal.held_order_source_recovery_events
 for each row execute function apex_internal.deny_order_detail_mutation();
alter table apex_internal.held_order_source_claims enable row level security;
alter table apex_internal.held_order_source_claims force row level security;
alter table apex_internal.held_order_source_deliveries enable row level security;
alter table apex_internal.held_order_source_deliveries force row level security;
alter table apex_internal.held_order_source_recovery_events enable row level security;
alter table apex_internal.held_order_source_recovery_events force row level security;
revoke all on apex_internal.held_order_source_claims,
 apex_internal.held_order_source_deliveries,
 apex_internal.held_order_source_recovery_events
 from public,anon,authenticated;
do $revoke_service$
begin
 if to_regrole('service_role') is not null then
  execute 'revoke all on apex_internal.held_order_source_claims, apex_internal.held_order_source_deliveries, apex_internal.held_order_source_recovery_events from service_role';
 end if;
end $revoke_service$;

-- Called ONLY by disposable admin test; writes unverified receipt metadata.
-- It cannot trust a browser/CSV webhook or mint authorization.
create function apex_internal.note_unverified_source_delivery(
 p_store uuid,p_sale uuid,p_delivery_ref text,p_source_sha256 text)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v_claim apex_internal.held_order_source_claims%rowtype;
 v_delivery apex_internal.held_order_source_deliveries%rowtype;
 v_new boolean:=false;
begin
 if current_database()<>'apex_test'
 then raise exception 'Disposable order journal only' using errcode='42501';end if;
 perform 1 from apex_internal.private_release_gate where singleton and enabled=false for share;
 if not found then raise exception 'Private release gate must remain disabled'
  using errcode='42501';end if;
 if p_store is null or p_sale is null or p_delivery_ref is null
  or p_delivery_ref !~ '^[A-Za-z0-9._:-]{1,100}$'
  or p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$'
 then raise exception 'Malformed unverified source identity' using errcode='23514';end if;
 if not exists (select 1 from public.supplier_sales_history s
  where s.id=p_sale and s.store_id=p_store)
 then raise exception 'Unbound historical source sale' using errcode='42501';end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   'apex_test_source_receipt:'||p_store::text||':'||p_sale::text,0));
 select * into v_claim from apex_internal.held_order_source_claims
  where store_id=p_store and sale_id=p_sale for update;
 if found then
  if v_claim.source_sha256 is distinct from p_source_sha256
   then raise exception 'Source hash conflict requires review' using errcode='23505';end if;
 else
  insert into apex_internal.held_order_source_claims(store_id,sale_id,source_sha256)
   values(p_store,p_sale,p_source_sha256);
 end if;
 select * into v_delivery from apex_internal.held_order_source_deliveries
  where store_id=p_store and source_kind='synthetic_ci_unverified'
    and delivery_reference=p_delivery_ref for update;
 if found then
  if v_delivery.sale_id is distinct from p_sale or
     v_delivery.source_sha256 is distinct from p_source_sha256
  then raise exception 'Conflicting delivery reference' using errcode='23505';end if;
  return jsonb_build_object('status','identical_delivery',
   'delivery_id',v_delivery.id,'source_verified',false,
   'can_create_order',false,'can_ship',false);
 end if;
 insert into apex_internal.held_order_source_deliveries(
  store_id,sale_id,source_sha256,source_kind,delivery_reference)
 values(p_store,p_sale,p_source_sha256,'synthetic_ci_unverified',p_delivery_ref)
 returning * into v_delivery;
 insert into apex_internal.held_order_source_recovery_events(delivery_id,event_type)
 values(v_delivery.id,'unverified_received');
 return jsonb_build_object('status','unverified_received',
  'delivery_id',v_delivery.id,'source_verified',false,
  'can_create_order',false,'can_ship',false);
end $fn$;

-- Crash-safe readback decision only. If a fully held snapshot already exists,
-- record that OBSERVATION once. If not, never retry by creating an order.
-- This is NOT source authentication, decrypt authorization or release.
create function apex_internal.review_source_delivery_readback(
 p_store uuid,p_delivery_ref text)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v_delivery apex_internal.held_order_source_deliveries%rowtype;
 v_order apex_internal.order_detail_snapshots%rowtype;
 v_complete boolean:=false;
 v_status text;
begin
 if current_database()<>'apex_test'
 then raise exception 'Disposable order journal only' using errcode='42501';end if;
 perform 1 from apex_internal.private_release_gate where singleton and enabled=false for share;
 if not found then raise exception 'Private release gate must remain disabled'
  using errcode='42501';end if;
 if p_store is null or p_delivery_ref is null
  or p_delivery_ref !~ '^[A-Za-z0-9._:-]{1,100}$'
 then raise exception 'Malformed source readback identity' using errcode='23514';end if;
 select * into v_delivery from apex_internal.held_order_source_deliveries
 where store_id=p_store and source_kind='synthetic_ci_unverified'
  and delivery_reference=p_delivery_ref for share;
 if not found then
  raise exception 'No recorded source receipt' using errcode='42501';end if;
 select * into v_order from apex_internal.order_detail_snapshots
  where store_id=p_store and sale_id=v_delivery.sale_id;
 if not found then
  return jsonb_build_object('status','requires_independent_source_attestation',
   'source_verified',false,'can_retry_order_write',false,
   'can_create_order',false,'can_ship',false);
 end if;
 select
   v_order.source_event_sha256=v_delivery.source_sha256
   and v_order.record_status='held_unverified'
   and v_order.fulfillment_authorized=false
   and v_order.payment_authorized=false
   and exists (select 1 from apex_internal.held_order_intake_audit a
      where a.order_id=v_order.id and a.store_id=p_store
       and a.source_sha256=v_delivery.source_sha256
       and a.event_type='snapshot_held')
   and exists (select 1 from apex_internal.order_delivery_envelopes d
      where d.order_id=v_order.id and d.store_id=p_store
       and d.delivery_verified=false)
   and exists (
     select 1 from apex_internal.held_order_intake_accounting a
     where a.order_id=v_order.id and a.store_id=p_store
       and a.source_gross_cents=v_order.source_gross_cents
       and a.expected_line_count =
          (select count(*) from apex_internal.order_line_snapshots l
             where l.order_id=v_order.id and l.store_id=p_store)
       and a.expected_line_count>0
   ) into v_complete;
 if v_complete is distinct from true then
  insert into apex_internal.held_order_source_recovery_events(delivery_id,event_type)
   values(v_delivery.id,'source_conflict_review')
   on conflict(delivery_id,event_type) do nothing;
  return jsonb_build_object('status','manual_conflict_review',
   'source_verified',false,'can_retry_order_write',false,
   'can_create_order',false,'can_ship',false);
 end if;
 insert into apex_internal.held_order_source_recovery_events(delivery_id,event_type)
  values(v_delivery.id,'held_snapshot_readback')
  on conflict(delivery_id,event_type) do nothing;
 return jsonb_build_object('status','held_snapshot_observed',
  'order_id',v_order.id,'source_verified',false,
  'can_retry_order_write',false,'can_create_order',false,'can_ship',false);
end $fn$;
revoke all on function apex_internal.note_unverified_source_delivery(
 uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function apex_internal.review_source_delivery_readback(
 uuid,text) from public,anon,authenticated;
do $postflight$
begin
 if has_function_privilege('anon',
  'apex_internal.note_unverified_source_delivery(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
  'apex_internal.review_source_delivery_readback(uuid,text)','EXECUTE')
 or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Source journal privacy or release gate failed';end if;
end $postflight$;
commit;
