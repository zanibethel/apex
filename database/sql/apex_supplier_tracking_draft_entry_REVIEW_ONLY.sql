-- Apex Issue #215 Phase 3: controlled supplier tracking DRAFT entry.
-- Disposable apex_test only. This is NOT a production migration or carrier
-- shipping authorization; no labels, delivery data, payment, or shipped state.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
  or to_regprocedure('apex_internal.record_review_tracking_draft(uuid,uuid,uuid,integer,text,text)') is null
  or to_regprocedure('public.get_supplier_review_fulfillment_queue(uuid,integer,integer)') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Supplier tracking draft RPC requires gated disposable DB';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.submit_supplier_review_tracking_draft(
 p_store_id uuid,p_shipment_id uuid,p_request_id uuid,
 p_expected_revision integer,p_carrier text,p_tracking_reference text)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_plan apex_internal.review_shipment_plans%rowtype;
 v_order apex_internal.order_detail_snapshots%rowtype;
 v_account apex_internal.held_order_intake_accounting%rowtype;
 v_receipt jsonb;
 v_status text;
 v_current_revision integer;
 v_last_carrier text;
 v_last_reference text;
begin
 if current_database()<>'apex_test'
  or p_store_id is null or p_shipment_id is null or p_request_id is null
  or v_uid is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or p_expected_revision is null
  or p_expected_revision not between 1 and 999
  or p_carrier is null or p_carrier not in ('USPS','UPS','FEDEX','DHL')
  or p_tracking_reference is null
  or p_tracking_reference !~ '^[A-Z0-9]{8,40}$'
  or not exists(
    select 1 from public.stores s
    join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=p_store_id and m.user_id=v_uid
     and m.role in ('owner','manager')
  )
 then raise exception 'Supplier tracking draft access denied'
  using errcode='42501';end if;

 perform 1 from apex_internal.private_release_gate
 where singleton and enabled=false for share;
 if not found then raise exception 'Tracking release gate denied'
  using errcode='42501';end if;
 select * into v_plan from apex_internal.review_shipment_plans
 where id=p_shipment_id and store_id=p_store_id;
 if not found or v_plan.plan_status<>'review_only'
   or v_plan.fulfillment_authorized<>false
   or v_plan.label_purchase_authorized<>false
 then raise exception 'Supplier review plan unavailable'
  using errcode='42501';end if;
 select * into v_order from apex_internal.order_detail_snapshots
 where id=v_plan.order_id and store_id=p_store_id;
 select * into v_account from apex_internal.held_order_intake_accounting
 where order_id=v_plan.order_id and store_id=p_store_id;
 if v_order.id is null or v_account.order_id is null
   or v_order.record_status<>'held_unverified'
   or v_order.payment_authorized<>false
   or v_order.fulfillment_authorized<>false
   or v_account.expected_line_count<1
   or v_account.expected_line_count<>(
     select count(*) from apex_internal.order_line_snapshots
     where order_id=v_plan.order_id and store_id=p_store_id)
   or v_account.line_subtotal_cents<>(
     select coalesce(sum(line_subtotal_cents),0)
      from apex_internal.order_line_snapshots
      where order_id=v_plan.order_id and store_id=p_store_id)
   or v_account.source_gross_cents<>v_order.source_gross_cents
   or not exists(select 1 from apex_internal.held_order_intake_audit a
      where a.order_id=v_plan.order_id and a.store_id=p_store_id
       and a.event_type='snapshot_held'
       and a.source_sha256=v_order.source_event_sha256)
   or not exists(select 1 from apex_internal.order_delivery_envelopes d
      where d.order_id=v_plan.order_id and d.store_id=p_store_id
        and d.shipping_authorized=false and d.delivery_verified=false)
 then raise exception 'Held purchase details incomplete'
  using errcode='42501';end if;

 -- The restricted private function locks the shipment row, enforces exact
 -- revision, unique per-store event key and carrier/tracking draft identity.
 -- Exception subtransactions roll back any attempted event+revision mutation.
 begin
  v_receipt:=apex_internal.record_review_tracking_draft(
   p_store_id,p_shipment_id,p_request_id,p_expected_revision,
   p_carrier,p_tracking_reference);
 exception
  when serialization_failure then v_status:='stale_version';
  when unique_violation then v_status:='duplicate_conflict';
 end;
 if v_status is null then
  if v_receipt->>'status' not in (
    'tracking_draft_recorded','identical_tracking_draft_replay')
  then raise exception 'Unexpected tracking draft receipt'
   using errcode='42501';end if;
  return jsonb_build_object(
   'status',case when v_receipt->>'status'='tracking_draft_recorded'
     then 'draft_saved' else 'identical_replay' end,
   'expected_revision',p_expected_revision,
   'observed_revision',(v_receipt->>'revision')::integer,
   'latest_carrier',p_carrier,'latest_tracking_reference',p_tracking_reference,
   'shipped',false,'carrier_verified',false,'label_purchased',false
  );
 end if;

 -- Diff hints are PRIVATE to the already-authorized supplier. This is only
 -- a metadata read; never decrypt customer destination or grant shipping.
 select revision into v_current_revision
 from apex_internal.review_shipment_plans
 where id=p_shipment_id and store_id=p_store_id;
 select carrier,tracking_reference into v_last_carrier,v_last_reference
 from apex_internal.review_shipment_events
 where shipment_id=p_shipment_id and store_id=p_store_id
  and event_kind='tracking_draft_recorded'
 order by revision desc limit 1;
 return jsonb_build_object(
  'status',v_status,'expected_revision',p_expected_revision,
  'observed_revision',v_current_revision,
  'latest_carrier',v_last_carrier,
  'latest_tracking_reference',v_last_reference,
  'shipped',false,'carrier_verified',false,'label_purchased',false
 );
end $fn$;

revoke all on function public.submit_supplier_review_tracking_draft(
 uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_supplier_review_tracking_draft(
 uuid,uuid,uuid,integer,text,text) to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.submit_supplier_review_tracking_draft(uuid,uuid,uuid,integer,text,text)','EXECUTE')
 or not has_function_privilege('authenticated',
  'public.submit_supplier_review_tracking_draft(uuid,uuid,uuid,integer,text,text)','EXECUTE')
 or has_table_privilege('authenticated',
   'apex_internal.review_shipment_events','INSERT')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review tracking draft RPC grants leak or release gate';end if;
end $postflight$;
commit;
