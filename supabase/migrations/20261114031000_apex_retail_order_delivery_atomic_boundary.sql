-- Retail order delivery envelope: encrypted before the reserved order can COMMIT.
-- No public checkout, service-role writer, scheduled process or key material.
-- Works with PR #335 private order-hold transaction; its gate remains OFF.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.retail_order_holds') is null or
    to_regclass('apex_internal.retail_order_hold_lines') is null or
    (select enabled from apex_internal.retail_order_engine_gate where singleton)
      is distinct from false or
    exists(select 1 from apex_internal.retail_order_holds
      where state='held_no_payment')
 then raise exception 'Retail order delivery preflight requires disabled engine and no active holds';
 end if;
end $preflight$;

create table apex_internal.retail_order_delivery_envelopes (
 order_id uuid primary key,
 store_id uuid not null,
 envelope_format text not null default 'aes-256-gcm-v1'
  check(envelope_format='aes-256-gcm-v1'),
 key_reference text not null
  check(key_reference ~ '^[A-Za-z0-9_-]{5,80}$'),
 nonce bytea not null check(octet_length(nonce)=12),
 ciphertext bytea not null check(octet_length(ciphertext) between 16 and 32768),
 auth_tag bytea not null check(octet_length(auth_tag)=16),
 delivery_verified boolean not null default false
  check(delivery_verified=false),
 shipping_authorized boolean not null default false
  check(shipping_authorized=false),
 sealed_at timestamptz not null default now(),
 foreign key(order_id,store_id)
  references apex_internal.retail_order_holds(id,store_id)
  on delete restrict
);
comment on table apex_internal.retail_order_delivery_envelopes is
 'Private AES-256-GCM encrypted delivery only, AAD-bound to store/order/key reference. No plaintext, payment or fulfillment rights.';

-- An immutable order ID must never become a committed stock reservation without
-- an encrypted delivery record. The deferred trigger allows the trusted app
-- to reserve, encrypt and attach the envelope inside ONE database transaction.
create function apex_internal.require_retail_delivery_at_commit()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $fn$
begin
 if not exists(select 1 from apex_internal.retail_order_delivery_envelopes e
   where e.order_id=new.id and e.store_id=new.store_id)
 then raise exception 'Atomic retail order missing sealed delivery'
   using errcode='23514';
 end if;
 return null;
end $fn$;
create constraint trigger apex_retail_delivery_required
 after insert on apex_internal.retail_order_holds
 deferrable initially deferred for each row
 execute function apex_internal.require_retail_delivery_at_commit();

create function apex_internal.reject_retail_delivery_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog as $fn$
begin
 raise exception 'Retail delivery envelopes are immutable'
  using errcode='42501';
end $fn$;
create trigger apex_retail_delivery_envelope_immutable
 before update or delete on apex_internal.retail_order_delivery_envelopes
 for each row execute function apex_internal.reject_retail_delivery_mutation();

alter table apex_internal.retail_order_delivery_envelopes
 enable row level security;
alter table apex_internal.retail_order_delivery_envelopes
 force row level security;
revoke all on apex_internal.retail_order_delivery_envelopes
 from public,anon,authenticated,service_role;

-- INTERNAL SECURITY INVOKER ONLY. The trusted application must call inside
-- the same open transaction as reserve_retail_order_hold, after sealing the
-- generated order ID with a secret-managed AES key outside PostgreSQL.
-- The API roles cannot invoke this procedure and the gate defaults OFF.
create function apex_internal.attach_retail_delivery_envelope(
 p_store_id uuid,p_order_id uuid,p_key_reference text,
 p_nonce bytea,p_ciphertext bytea,p_auth_tag bytea
) returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog as $fn$
declare
 v_order apex_internal.retail_order_holds%rowtype;
 v_existing apex_internal.retail_order_delivery_envelopes%rowtype;
begin
 if p_store_id is null or p_order_id is null or
  p_key_reference is null or
  p_key_reference !~ '^[A-Za-z0-9_-]{5,80}$' or
  p_nonce is null or octet_length(p_nonce)<>12 or
  p_ciphertext is null or octet_length(p_ciphertext) not between 16 and 32768 or
  p_auth_tag is null or octet_length(p_auth_tag)<>16
 then raise exception 'Invalid sealed delivery envelope' using errcode='22023';end if;

 if not exists(select 1 from apex_internal.retail_order_engine_gate
  where singleton=true and enabled=true)
 then raise exception 'Retail order engine remains disabled' using errcode='42501';end if;

 select * into v_order from apex_internal.retail_order_holds
  where id=p_order_id and store_id=p_store_id for update;
 if not found or v_order.state<>'held_no_payment' or
    v_order.expires_at<=clock_timestamp()
 then raise exception 'Active order hold unavailable for delivery'
  using errcode='23514';end if;

 select * into v_existing from apex_internal.retail_order_delivery_envelopes e
 where e.order_id=p_order_id for share;
 if found then
  if v_existing.store_id<>p_store_id or
    v_existing.key_reference<>p_key_reference or
    v_existing.nonce<>p_nonce or
    v_existing.ciphertext<>p_ciphertext or
    v_existing.auth_tag<>p_auth_tag
  then raise exception 'Delivery record already sealed' using errcode='23505';end if;
  return jsonb_build_object('schema_version',1,'order_id',p_order_id,
   'sealed',true,'replayed',true,'can_pay',false,'can_ship',false);
 end if;

 insert into apex_internal.retail_order_delivery_envelopes (
  order_id,store_id,envelope_format,key_reference,nonce,ciphertext,
  auth_tag,delivery_verified,shipping_authorized
 ) values (
  p_order_id,p_store_id,'aes-256-gcm-v1',p_key_reference,p_nonce,
  p_ciphertext,p_auth_tag,false,false
 );
 return jsonb_build_object('schema_version',1,'order_id',p_order_id,
  'sealed',true,'replayed',false,'can_pay',false,'can_ship',false);
end $fn$;

-- PRIVATE receipt for the future authenticated, ownership-bound server
-- coordinator. This is NOT a public order lookup or payment confirmation.
-- Only non-sensitive order facts and an opaque delivery-present flag.
create function apex_internal.get_retail_order_hold_receipt(
 p_store_id uuid,p_order_id uuid
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog as $fn$
declare
 v_order apex_internal.retail_order_holds%rowtype;
 v_has_delivery boolean;
begin
 if p_store_id is null or p_order_id is null
 then raise exception 'Invalid held order reference' using errcode='22023';end if;
 select * into v_order from apex_internal.retail_order_holds h
  where h.id=p_order_id and h.store_id=p_store_id;
 if not found then raise exception 'Held order receipt unavailable'
  using errcode='23514';end if;
 select exists(select 1 from apex_internal.retail_order_delivery_envelopes e
   where e.order_id=v_order.id and e.store_id=v_order.store_id)
  into v_has_delivery;
 return jsonb_build_object(
  'schema_version',1,'order_id',v_order.id,'store_id',v_order.store_id,
  'created_at',to_char(v_order.created_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'expires_at',to_char(v_order.expires_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'status',v_order.state,'currency',v_order.currency,
  'line_count',v_order.line_count,'unit_count',v_order.unit_count,
  'merchandise_cents',v_order.merchandise_cents::text,
  'discount_cents',v_order.merchandise_discount_cents::text,
  'shipping_cents',v_order.shipping_cents::text,
  'total_cents',v_order.total_cents::text,
  'delivery_sealed',v_has_delivery,
  'can_pay',false,'can_ship',false,'invoice_created',false,
  'payment_confirmed',false);
end $fn$;

revoke all on function apex_internal.require_retail_delivery_at_commit()
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.reject_retail_delivery_mutation()
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.attach_retail_delivery_envelope(
 uuid,uuid,text,bytea,bytea,bytea)
 from public,anon,authenticated,service_role;
revoke all on function apex_internal.get_retail_order_hold_receipt(uuid,uuid)
 from public,anon,authenticated,service_role;

do $postflight$
begin
 if (select enabled from apex_internal.retail_order_engine_gate where singleton)
  is distinct from false or
  has_function_privilege('anon',
   'apex_internal.get_retail_order_hold_receipt(uuid,uuid)','EXECUTE') or
  has_function_privilege('authenticated',
   'apex_internal.attach_retail_delivery_envelope(uuid,uuid,text,bytea,bytea,bytea)','EXECUTE') or
  has_function_privilege('service_role',
   'apex_internal.attach_retail_delivery_envelope(uuid,uuid,text,bytea,bytea,bytea)','EXECUTE') or
  has_table_privilege('anon','apex_internal.retail_order_delivery_envelopes','SELECT')
 then raise exception 'Private delivery safety gate failed';end if;
end $postflight$;
commit;
