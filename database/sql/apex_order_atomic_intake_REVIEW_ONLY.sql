-- Issue #214, phase 3. DISPOSABLE DATABASE ONLY.
-- This file intentionally does not live in supabase/migrations. It cannot
-- apply to production and grants no order-ingestion function to app roles.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
    or to_regclass('apex_internal.order_detail_snapshots') is null
    or to_regclass('apex_internal.order_line_snapshots') is null
    or to_regclass('apex_internal.order_delivery_envelopes') is null
    or (select enabled from apex_internal.private_release_gate where singleton)
       is distinct from false
 then raise exception 'Atomic order intake is disposable-only and gated'; end if;
end $preflight$;

begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Accounting commitment is separate from immutable purchase identity, and
-- captures line completeness plus shipping/discount reconciliation.
create table apex_internal.held_order_intake_accounting (
 order_id uuid primary key,
 store_id uuid not null,
 expected_line_count smallint not null check(expected_line_count between 1 and 50),
 line_subtotal_cents bigint not null check(line_subtotal_cents>=0),
 shipping_cents bigint not null check(shipping_cents between 0 and 10000000),
 discount_cents bigint not null check(discount_cents>=0),
 source_gross_cents bigint not null check(source_gross_cents>=0),
 recorded_at timestamptz not null default now(),
 check(discount_cents<=line_subtotal_cents+shipping_cents),
 check(source_gross_cents=line_subtotal_cents+shipping_cents-discount_cents),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id) on delete restrict
);
create trigger apex_held_order_accounting_immutable
 before update or delete on apex_internal.held_order_intake_accounting
 for each row execute function apex_internal.deny_order_detail_mutation();

-- Confidential audit metadata only, never address/ciphertext or raw events.
create table apex_internal.held_order_intake_audit (
 id bigint generated always as identity primary key,
 order_id uuid not null,
 store_id uuid not null,
 event_type text not null check(event_type='snapshot_held'),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 foreign key(order_id,store_id)
  references apex_internal.order_detail_snapshots(id,store_id) on delete restrict
);
create trigger apex_held_order_audit_immutable
 before update or delete on apex_internal.held_order_intake_audit
 for each row execute function apex_internal.deny_order_detail_mutation();

alter table apex_internal.held_order_intake_accounting enable row level security;
alter table apex_internal.held_order_intake_accounting force row level security;
alter table apex_internal.held_order_intake_audit enable row level security;
alter table apex_internal.held_order_intake_audit force row level security;
revoke all on apex_internal.held_order_intake_accounting,
 apex_internal.held_order_intake_audit from public,anon,authenticated;
-- The privileged SQL invocation is intended ONLY for an isolated test admin.
-- Actual source authentication, receipt and independent authorization MUST
-- happen in a later, separately approved server connector.
create function apex_internal.persist_held_order_snapshot(
 p_header jsonb,p_lines jsonb,p_delivery jsonb,p_accounting jsonb)
 returns jsonb language plpgsql volatile security invoker
 set search_path=pg_catalog as $fn$
declare
 v_source public.supplier_sales_history%rowtype;
 v_old apex_internal.order_detail_snapshots%rowtype;
 v_order uuid;
 v_line jsonb;
 v_position integer:=0;
 v_count integer;
 v_subtotal bigint:=0;
 v_quantity integer;
 v_unit bigint;
 v_gross bigint;
 v_shipping bigint;
 v_discount bigint;
 v_store uuid;
 v_sale uuid;
 v_replay_ok boolean;
 v_existing_lines integer;
 v_nonce bytea;
 v_ciphertext bytea;
 v_tag bytea;
begin
 -- Double lock: release gate stays off, and the source sale row serializes
 -- competing submissions of the same canonical order.
 perform 1 from apex_internal.private_release_gate
  where singleton and enabled=false for share;
 if not found then raise exception 'Intake release gate denied'
  using errcode='42501'; end if;
 if p_header is null or jsonb_typeof(p_header)<>'object'
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    or p_delivery is null or jsonb_typeof(p_delivery)<>'object'
    or p_accounting is null or jsonb_typeof(p_accounting)<>'object'
 then raise exception 'Invalid held snapshot input' using errcode='23514';end if;

 if not (p_header ?& array['store_id','sale_id','source_order_reference',
      'original_purchased_at','source_payment_state','source_gross_cents',
      'currency','source_event_sha256','record_status',
      'fulfillment_authorized','payment_authorized'])
    or (select count(*) from jsonb_object_keys(p_header))<>11
    or not (p_accounting ?& array['line_subtotal_cents','shipping_cents',
      'discount_cents','source_gross_cents'])
    or (select count(*) from jsonb_object_keys(p_accounting))<>4
    or not (p_delivery ?& array['store_id','envelope_format',
      'key_reference','nonce_base64','ciphertext_base64',
      'auth_tag_base64','delivery_verified','shipping_authorized'])
    or (select count(*) from jsonb_object_keys(p_delivery))<>8
 then raise exception 'Unexpected held snapshot fields' using errcode='23514';end if;

 v_store:=(p_header->>'store_id')::uuid;
 v_sale:=(p_header->>'sale_id')::uuid;
 v_gross:=(p_header->>'source_gross_cents')::bigint;
 v_shipping:=(p_accounting->>'shipping_cents')::bigint;
 v_discount:=(p_accounting->>'discount_cents')::bigint;
 v_count:=jsonb_array_length(p_lines);
 if v_count not between 1 and 50
    or v_gross<0 or v_gross>500000000000
    or v_shipping not between 0 and 10000000
    or v_discount<0
    or p_header->>'currency'<>'USD'
    or p_header->>'record_status'<>'held_unverified'
    or p_header->'fulfillment_authorized'<>'false'::jsonb
    or p_header->'payment_authorized'<>'false'::jsonb
    or p_header->>'source_event_sha256' !~ '^[0-9a-f]{64}$'
    or p_delivery->>'store_id'<>v_store::text
    or p_delivery->>'envelope_format'<>'aes-256-gcm-v1'
    or p_delivery->>'key_reference' !~ '^[A-Za-z0-9_-]{5,80}$'
    or p_delivery->'delivery_verified'<>'false'::jsonb
    or p_delivery->'shipping_authorized'<>'false'::jsonb
    or (p_accounting->>'source_gross_cents')::bigint<>v_gross
 then raise exception 'Held snapshot has unauthorized state'
  using errcode='23514';end if;

 select * into v_source from public.supplier_sales_history
  where id=v_sale for update;
 if not found
    or v_source.store_id is distinct from v_store
    or v_source.order_reference is distinct from p_header->>'source_order_reference'
    or v_source.occurred_at is distinct from
       (p_header->>'original_purchased_at')::timestamptz
    or v_source.sale_state is distinct from p_header->>'source_payment_state'
    or v_source.gross_cents is distinct from v_gross
    or v_source.currency is distinct from 'USD'
 then raise exception 'Recorded source sale mismatch' using errcode='23514';end if;

 -- Strict shape and arithmetic rechecked at the database trust boundary.
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_position:=v_position+1;
  if jsonb_typeof(v_line)<>'object'
   or not (v_line ?& array['store_id','source_line_reference','line_number',
       'product_id','sku_at_purchase','title_at_purchase','variant_at_purchase',
       'quantity','unit_price_cents','currency','source_line_sha256',
       'product_eligibility','shipping_authorized'])
   or (select count(*) from jsonb_object_keys(v_line))<>13
   or v_line->>'store_id'<>v_store::text
   or (v_line->>'line_number')::integer<>v_position
   or v_line->>'currency'<>'USD'
   or v_line->>'product_eligibility'<>'not_verified'
   or v_line->'shipping_authorized'<>'false'::jsonb
   or v_line->>'source_line_sha256' !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid held order line' using errcode='23514';end if;
  v_quantity:=(v_line->>'quantity')::integer;
  v_unit:=(v_line->>'unit_price_cents')::bigint;
  if v_quantity not between 1 and 100 or v_unit not between 0 and 99999999
  then raise exception 'Line quantity or price invalid'
   using errcode='23514';end if;
  v_subtotal:=v_subtotal+v_quantity::bigint*v_unit;
 end loop;
 if v_subtotal is distinct from (p_accounting->>'line_subtotal_cents')::bigint
    or v_discount>v_subtotal+v_shipping
    or v_subtotal+v_shipping-v_discount<>v_gross
 then raise exception 'Incomplete lines or amount mismatch'
  using errcode='23514';end if;

 -- Canonical binary encoding checks (no plaintext or keys in the DB).
 v_nonce:=decode(p_delivery->>'nonce_base64','base64');
 v_ciphertext:=decode(p_delivery->>'ciphertext_base64','base64');
 v_tag:=decode(p_delivery->>'auth_tag_base64','base64');
 if octet_length(v_nonce)<>12 or octet_length(v_ciphertext) not between 16 and 32768
    or octet_length(v_tag)<>16
    or encode(v_nonce,'base64')<>p_delivery->>'nonce_base64'
    or encode(v_ciphertext,'base64')<>p_delivery->>'ciphertext_base64'
    or encode(v_tag,'base64')<>p_delivery->>'auth_tag_base64'
 then raise exception 'Invalid sealed destination envelope'
  using errcode='23514';end if;

 select * into v_old from apex_internal.order_detail_snapshots
   where store_id=v_store and sale_id=v_sale;
 if found then
  -- A fresh AES-GCM nonce on a true replay is expected; never demand
  -- byte-for-byte equality of randomized ciphertext, and never overwrite.
  select count(*) into v_existing_lines
    from apex_internal.order_line_snapshots where order_id=v_old.id;
  select v_old.store_id=v_store
    and v_old.source_order_reference=p_header->>'source_order_reference'
    and v_old.original_purchased_at=(p_header->>'original_purchased_at')::timestamptz
    and v_old.source_payment_state=p_header->>'source_payment_state'
    and v_old.source_gross_cents=v_gross
    and v_old.source_event_sha256=p_header->>'source_event_sha256'
    and v_existing_lines=v_count
    and exists (select 1 from apex_internal.order_delivery_envelopes
                where order_id=v_old.id and store_id=v_store)
    and exists (select 1 from apex_internal.held_order_intake_accounting a
                where a.order_id=v_old.id and a.store_id=v_store
                and a.expected_line_count=v_count
                and a.line_subtotal_cents=v_subtotal and a.shipping_cents=v_shipping
                and a.discount_cents=v_discount and a.source_gross_cents=v_gross)
    and not exists (
      select 1 from jsonb_array_elements(p_lines) with ordinality as j(line,ordinal)
      left join apex_internal.order_line_snapshots l
        on l.order_id=v_old.id and l.line_number=j.ordinal
      where l.id is null
       or l.store_id is distinct from v_store
       or l.source_line_reference is distinct from j.line->>'source_line_reference'
       or l.product_id::text is distinct from j.line->>'product_id'
       or l.sku_at_purchase is distinct from j.line->>'sku_at_purchase'
       or l.title_at_purchase is distinct from j.line->>'title_at_purchase'
       or l.variant_at_purchase is distinct from j.line->>'variant_at_purchase'
       or l.quantity is distinct from (j.line->>'quantity')::integer
       or l.unit_price_cents is distinct from (j.line->>'unit_price_cents')::bigint
       or l.source_line_sha256 is distinct from j.line->>'source_line_sha256'
    ) into v_replay_ok;
  if v_replay_ok is distinct from true
    then raise exception 'Conflicting order replay' using errcode='23505';end if;
  return jsonb_build_object('status','identical_replay',
    'order_id',v_old.id,'held_only',true);
 end if;

 -- All inserts occur in one statement's transaction. Any failure at any
 -- stage rolls back header, all lines, encrypted destination and audit.
 insert into apex_internal.order_detail_snapshots(
  store_id,sale_id,source_order_reference,original_purchased_at,
  source_payment_state,source_gross_cents,currency,source_event_sha256)
 values(v_store,v_sale,p_header->>'source_order_reference',
  (p_header->>'original_purchased_at')::timestamptz,
  p_header->>'source_payment_state',v_gross,'USD',
  p_header->>'source_event_sha256')
 returning id into v_order;

 for v_line in select value from jsonb_array_elements(p_lines) loop
  insert into apex_internal.order_line_snapshots(
   order_id,store_id,source_line_reference,line_number,product_id,
   sku_at_purchase,title_at_purchase,variant_at_purchase,quantity,
   unit_price_cents,currency,source_line_sha256)
  values(v_order,v_store,v_line->>'source_line_reference',
   (v_line->>'line_number')::smallint,(v_line->>'product_id')::uuid,
   v_line->>'sku_at_purchase',v_line->>'title_at_purchase',
   v_line->>'variant_at_purchase',(v_line->>'quantity')::integer,
   (v_line->>'unit_price_cents')::bigint,'USD',v_line->>'source_line_sha256');
 end loop;

 insert into apex_internal.order_delivery_envelopes(
  order_id,store_id,envelope_format,key_reference,nonce,ciphertext,auth_tag)
 values(v_order,v_store,'aes-256-gcm-v1',p_delivery->>'key_reference',
   v_nonce,v_ciphertext,v_tag);

 insert into apex_internal.held_order_intake_accounting(
  order_id,store_id,expected_line_count,line_subtotal_cents,shipping_cents,
  discount_cents,source_gross_cents)
 values(v_order,v_store,v_count,v_subtotal,v_shipping,v_discount,v_gross);

 insert into apex_internal.held_order_intake_audit(
  order_id,store_id,event_type,source_sha256)
 values(v_order,v_store,'snapshot_held',p_header->>'source_event_sha256');
 return jsonb_build_object('status','new','order_id',v_order,'held_only',true);
end $fn$;

revoke all on function apex_internal.persist_held_order_snapshot(
 jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
-- The Supabase service_role is not an authorized source, either.
do $privs$
begin
 if to_regrole('service_role') is not null then
  execute 'revoke all on function apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb) from service_role';
  execute 'revoke all on apex_internal.held_order_intake_accounting, apex_internal.held_order_intake_audit from service_role';
 end if;
end $privs$;
do $postflight$
begin
 if has_function_privilege('authenticated',
  'apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb)','EXECUTE')
   or has_function_privilege('anon',
  'apex_internal.persist_held_order_snapshot(jsonb,jsonb,jsonb,jsonb)','EXECUTE')
   or (select enabled from apex_internal.private_release_gate where singleton)
      is distinct from false
 then raise exception 'Atomic intake privacy postflight denied';end if;
end $postflight$;
commit;
