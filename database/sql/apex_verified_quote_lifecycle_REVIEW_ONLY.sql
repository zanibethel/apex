-- PR #192: synthetic-only quote evidence and held-order lifecycle.
-- Never install outside isolated CI database apex_test. No production API.
\set ON_ERROR_STOP on
do $guard$
begin
 if current_database()<>'apex_test'
 or to_regclass('apex_test_reservation.orders') is null
 or to_regprocedure('apex_test_reservation.reserve_held_contract(uuid,text,jsonb,text,text,text,bigint)') is null
 then raise exception 'Trusted quote lifecycle may only load after disposable reservation fixture';end if;
end $guard$;

-- PR #191's prior concurrency fixture intentionally leaves synthetic holds.
-- Reset ONLY disposable fixture tables before running this independent stage.
truncate table apex_test_reservation.order_lines,apex_test_reservation.orders;
update apex_test_reservation.inventory set reserved=0;

-- An admitted provider receipt is distinct from a browser quote.
-- In this test fixture, the evidence is synthetic and DOES NOT establish
-- actual provider signatures or actual shipping/tax service connectivity.
create table apex_test_reservation.provider_quote_evidence(
 kind text not null check(kind in ('shipping','tax')),
 quote_ref text not null,
 provider_id text not null check(length(provider_id) between 3 and 90),
 source_receipt_id text not null unique,
 verifier_id text not null check(length(verifier_id) between 3 and 90),
 store_id uuid not null,
 cart_fingerprint text not null check(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 destination_region text not null check(destination_region ~ '^[A-Z]{2}$'),
 amount_cents bigint not null check(amount_cents between 0 and 999999999),
 currency text not null check(currency='USD'),
 expires_at timestamptz not null,
 verified_at timestamptz not null,
 verification_status text not null
  check(verification_status in ('fixture_verified','rejected')),
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 primary key(kind,quote_ref),
 check(provider_id<>verifier_id)
);
revoke all on table apex_test_reservation.provider_quote_evidence
 from public,anon,authenticated;

create function apex_test_reservation.evidence_digest(
 p_kind text,p_ref text,p_provider text,p_store uuid,p_cart text,
 p_region text,p_amount bigint,p_currency text,p_expires timestamptz
) returns text language sql stable security invoker
 set search_path=pg_catalog as $fn$
 select encode(sha256(convert_to(format(
  '%s|%s|%s|%s|%s|%s|%s|%s|%s',
  p_kind,p_ref,p_provider,p_store::text,p_cart,p_region,
  p_amount::text,p_currency,extract(epoch from p_expires)::text
 ),'UTF8')),'hex')
$fn$;
revoke all on function apex_test_reservation.evidence_digest(
 text,text,text,uuid,text,text,bigint,text,timestamptz)
 from public,anon,authenticated;

create function apex_test_reservation.forbid_quote_evidence_mutation()
 returns trigger language plpgsql security invoker
 set search_path=pg_catalog as $fn$
begin
 raise exception 'Provider verification evidence cannot be rewritten'
  using errcode='55000';
end $fn$;
revoke all on function apex_test_reservation.forbid_quote_evidence_mutation()
 from public,anon,authenticated;
create trigger deny_quote_evidence_mutation
 before update or delete on apex_test_reservation.provider_quote_evidence
 for each row execute function apex_test_reservation.forbid_quote_evidence_mutation();

-- Provider and verifier identities are independently represented in a
-- synthetic verification receipt; no browser-origin evidence accepted.
insert into apex_test_reservation.provider_quote_evidence(
 kind,quote_ref,provider_id,source_receipt_id,verifier_id,
 store_id,cart_fingerprint,destination_region,amount_cents,currency,
 expires_at,verified_at,verification_status,payload_digest)
select kind,quote_ref,provider_id,kind||'-evidence-'||quote_ref,verifier_id,
 store_id,cart_fingerprint,destination_region,amount_cents,currency,
 expires_at,now()-interval '1 minute','fixture_verified',
 apex_test_reservation.evidence_digest(kind,quote_ref,provider_id,store_id,
  cart_fingerprint,destination_region,amount_cents,currency,expires_at)
from (
 select 'shipping'::text kind,s.quote_ref,'synthetic_shipping_provider'::text provider_id,
  'independent_shipping_verifier'::text verifier_id,
  s.store_id,s.cart_fingerprint,s.destination_region,s.amount_cents,
  s.currency,s.expires_at from apex_test_reservation.shipping_quotes s
 union all
 select 'tax',t.quote_ref,'synthetic_tax_provider',
  'independent_tax_verifier',
  t.store_id,t.cart_fingerprint,t.destination_region,t.amount_cents,
  t.currency,t.expires_at from apex_test_reservation.tax_quotes t
) q;

-- A held order is a distinct terminal-state machine. Cancellation/expiry
-- never deletes order history and cannot accidentally set payment status.
alter table apex_test_reservation.orders
 drop constraint orders_state_check;
alter table apex_test_reservation.orders
 add column held_until timestamptz not null default (now()+interval '15 minutes'),
 add column released_at timestamptz,
 add column release_reason text,
 add constraint orders_state_check check(state in (
  'held_fixture_only','cancelled_fixture_only','expired_fixture_only')),
 add constraint orders_release_consistency_check check(
  (state='held_fixture_only' and released_at is null and release_reason is null)
  or (state='cancelled_fixture_only' and released_at is not null and release_reason='cancel')
  or (state='expired_fixture_only' and released_at is not null and release_reason='expire')
 );
create table apex_test_reservation.order_release_events(
 order_id uuid primary key references apex_test_reservation.orders(id),
 store_id uuid not null,
 reason text not null check(reason in ('cancel','expire')),
 occurred_at timestamptz not null default now()
);
revoke all on table apex_test_reservation.order_release_events
 from public,anon,authenticated;

create function apex_test_reservation.reserve_with_verified_quotes(
 p_store_id uuid,p_idempotency_hash text,p_items jsonb,
 p_shipping_ref text,p_tax_ref text,p_region text,
 p_expected_total_cents bigint
) returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_shipping apex_test_reservation.shipping_quotes%rowtype;
 v_tax apex_test_reservation.tax_quotes%rowtype;
 v_shipping_evidence apex_test_reservation.provider_quote_evidence%rowtype;
 v_tax_evidence apex_test_reservation.provider_quote_evidence%rowtype;
 v_result jsonb;
 v_order_id uuid;
 v_expiry timestamptz;
 v_state text;
begin
 if current_database()<>'apex_test' then
  raise exception 'Test-only verified quote reservation'
    using errcode='42501';end if;
 if p_store_id is null or p_shipping_ref is null or p_tax_ref is null
  or p_region is null then
  raise exception 'Incomplete trusted quote reference'
   using errcode='22023';end if;

 -- Lock quotes and immutable verification evidence through the reservation
 -- transaction. No quote can be changed between verification and inventory.
 select * into v_shipping from apex_test_reservation.shipping_quotes s
  where s.quote_ref=p_shipping_ref and s.store_id=p_store_id
  for share;
 select * into v_tax from apex_test_reservation.tax_quotes t
  where t.quote_ref=p_tax_ref and t.store_id=p_store_id
  for share;
 select * into v_shipping_evidence
  from apex_test_reservation.provider_quote_evidence e
  where e.kind='shipping' and e.quote_ref=p_shipping_ref for share;
 select * into v_tax_evidence
  from apex_test_reservation.provider_quote_evidence e
  where e.kind='tax' and e.quote_ref=p_tax_ref for share;
 if v_shipping.quote_ref is null or v_tax.quote_ref is null
  or v_shipping_evidence.quote_ref is null
  or v_tax_evidence.quote_ref is null
 then raise exception 'Independent quote evidence missing' using errcode='23514';end if;

 if v_shipping_evidence.verification_status<>'fixture_verified'
  or v_tax_evidence.verification_status<>'fixture_verified'
  or v_shipping_evidence.verifier_id=v_tax_evidence.verifier_id
  or v_shipping_evidence.provider_id<>'synthetic_shipping_provider'
  or v_tax_evidence.provider_id<>'synthetic_tax_provider'
  or v_shipping_evidence.verifier_id<>'independent_shipping_verifier'
  or v_tax_evidence.verifier_id<>'independent_tax_verifier'
  or v_shipping_evidence.verified_at>now()
  or v_tax_evidence.verified_at>now()
  or v_shipping_evidence.expires_at<=now()+interval '1 minute'
  or v_tax_evidence.expires_at<=now()+interval '1 minute'
  or v_shipping_evidence.store_id<>p_store_id
  or v_tax_evidence.store_id<>p_store_id
  or v_shipping_evidence.destination_region<>p_region
  or v_tax_evidence.destination_region<>p_region
  or v_shipping_evidence.cart_fingerprint<>v_shipping.cart_fingerprint
  or v_tax_evidence.cart_fingerprint<>v_tax.cart_fingerprint
  or v_shipping_evidence.amount_cents<>v_shipping.amount_cents
  or v_tax_evidence.amount_cents<>v_tax.amount_cents
  or v_shipping_evidence.currency<>v_shipping.currency
  or v_tax_evidence.currency<>v_tax.currency
  or v_shipping_evidence.expires_at<>v_shipping.expires_at
  or v_tax_evidence.expires_at<>v_tax.expires_at
  or v_shipping_evidence.payload_digest<>
   apex_test_reservation.evidence_digest(
    v_shipping_evidence.kind,v_shipping_evidence.quote_ref,
    v_shipping_evidence.provider_id,v_shipping_evidence.store_id,
    v_shipping_evidence.cart_fingerprint,v_shipping_evidence.destination_region,
    v_shipping_evidence.amount_cents,v_shipping_evidence.currency,
    v_shipping_evidence.expires_at)
  or v_tax_evidence.payload_digest<>
   apex_test_reservation.evidence_digest(
    v_tax_evidence.kind,v_tax_evidence.quote_ref,
    v_tax_evidence.provider_id,v_tax_evidence.store_id,
    v_tax_evidence.cart_fingerprint,v_tax_evidence.destination_region,
    v_tax_evidence.amount_cents,v_tax_evidence.currency,v_tax_evidence.expires_at)
 then raise exception 'Quote evidence failed independent verification contract'
  using errcode='23514';end if;

 v_result:=apex_test_reservation.reserve_held_contract(
  p_store_id,p_idempotency_hash,p_items,
  p_shipping_ref,p_tax_ref,p_region,p_expected_total_cents);

 -- Newly created holds are bounded by BOTH approved external quote expiries.
 -- A replay never extends the clock or creates a new reservation.
 v_order_id:=(v_result->>'order_id')::uuid;
 if v_result->>'state'='held_fixture_only' then
  v_expiry:=least(now()+interval '15 minutes',
   v_shipping_evidence.expires_at,v_tax_evidence.expires_at);
  update apex_test_reservation.orders
   set held_until=v_expiry where id=v_order_id
    and store_id=p_store_id and state='held_fixture_only';
 end if;
 select o.state into v_state from apex_test_reservation.orders o
  where o.id=v_order_id and o.store_id=p_store_id;
 if v_state='cancelled_fixture_only' then
  return jsonb_build_object('state','replayed_cancelled_fixture_only',
   'order_id',v_order_id,'fixture_only',true,
   'can_pay',false,'invoice_created',false);end if;
 if v_state='expired_fixture_only' then
  return jsonb_build_object('state','replayed_expired_fixture_only',
   'order_id',v_order_id,'fixture_only',true,
   'can_pay',false,'invoice_created',false);end if;
 return v_result||jsonb_build_object(
  'reservation_expires_at',(
   select o.held_until from apex_test_reservation.orders o
    where o.id=v_order_id),
  'can_pay',false,'invoice_created',false);
end $fn$;
revoke all on function apex_test_reservation.reserve_with_verified_quotes(
 uuid,text,jsonb,text,text,text,bigint)
 from public,anon,authenticated;

create function apex_test_reservation.release_held_contract(
 p_store_id uuid,p_order_id uuid,p_reason text
) returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_order apex_test_reservation.orders%rowtype;
 v_line record;
 v_changed integer;
begin
 if current_database()<>'apex_test' then
  raise exception 'Test-only hold release' using errcode='42501';end if;
 if p_reason is null or p_reason not in ('cancel','expire')
 then raise exception 'Invalid release reason' using errcode='22023';end if;
 select * into v_order from apex_test_reservation.orders o
 where o.store_id=p_store_id and o.id=p_order_id
 for update;
 if not found then
  raise exception 'Held order not found in store' using errcode='42501';end if;

 if v_order.state<>'held_fixture_only' then
  return jsonb_build_object('state',v_order.state,
   'order_id',v_order.id,'released_now',false,
   'fixture_only',true,'can_pay',false);
 end if;
 if p_reason='expire' and clock_timestamp()<v_order.held_until
 then raise exception 'Reservation has not expired' using errcode='23514';end if;

 for v_line in select l.product_id,l.quantity from
  apex_test_reservation.order_lines l where l.order_id=p_order_id
  order by l.product_id
 loop
  update apex_test_reservation.inventory i
   set reserved=reserved-v_line.quantity
   where i.store_id=p_store_id and i.product_id=v_line.product_id
    and i.reserved>=v_line.quantity;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then
   raise exception 'Reservation release inventory mismatch'
   using errcode='23514';end if;
 end loop;
 update apex_test_reservation.orders set
  state=case when p_reason='cancel'
   then 'cancelled_fixture_only' else 'expired_fixture_only' end,
  released_at=clock_timestamp(),release_reason=p_reason
 where id=p_order_id and store_id=p_store_id;
 insert into apex_test_reservation.order_release_events(
   order_id,store_id,reason)
  values(p_order_id,p_store_id,p_reason);
 return jsonb_build_object(
  'state',case when p_reason='cancel'
   then 'cancelled_fixture_only' else 'expired_fixture_only' end,
  'order_id',p_order_id,'released_now',true,
  'fixture_only',true,'can_pay',false);
end $fn$;
revoke all on function apex_test_reservation.release_held_contract(
 uuid,uuid,text) from public,anon,authenticated;

create function apex_test_reservation.expire_due_holds(p_limit integer)
 returns integer language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_order record;
 v_count integer:=0;
begin
 if current_database()<>'apex_test' then
  raise exception 'Test-only hold expiry' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 50
 then raise exception 'Invalid expiration batch' using errcode='22023';end if;
 for v_order in
  select id,store_id from apex_test_reservation.orders
   where state='held_fixture_only' and held_until<=clock_timestamp()
   order by held_until,id for update skip locked limit p_limit
 loop
  perform apex_test_reservation.release_held_contract(
   v_order.store_id,v_order.id,'expire');
  v_count:=v_count+1;
 end loop;
 return v_count;
end $fn$;
revoke all on function apex_test_reservation.expire_due_holds(integer)
 from public,anon,authenticated;
select 'synthetic_verified_quote_lifecycle_ready';
