-- Issue #217 Phase 2: supplier-scoped, read-only source and eligibility
-- evidence gate for a HELD report. Disposable apex_test ONLY.
-- A confirmed sale-history row is not independent payment settlement proof,
-- product transport eligibility, destination authorization, or permission
-- to send an actionable fulfillment email.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regclass('apex_internal.order_detail_snapshots') is null
 or to_regclass('apex_internal.held_order_intake_accounting') is null
 or to_regclass('apex_internal.order_line_snapshots') is null
 or to_regclass('public.supplier_sales_history') is null
 or to_regprocedure('public.get_supplier_review_email_status(uuid,date)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review evidence gate requires disposable held-order DB';end if;
end $preflight$;
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function public.get_supplier_review_report_evidence_gate(p_store_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_total integer;v_confirmed integer;v_nonconfirmed integer;
 v_source_drift integer;v_complete integer;v_incomplete integer;
 v_lines_unverified integer;v_accounted_lines integer;
begin
 if current_database()<>'apex_test'
  or p_store_id is null or v_uid is null
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid)
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Supplier source evidence denied' using errcode='42501';end if;

 -- Independent CURRENT sale-history identity (not only the immutable
 -- original sale snapshot) and complete persisted held-order accounting.
 -- Metadata counts only. No customer, product names, hashes or addresses.
 with source as (
  select h.id,h.store_id,
   s.id is not null and
    s.store_id=h.store_id and
    s.order_reference=h.source_order_reference and
    s.occurred_at=h.original_purchased_at and
    s.gross_cents=h.source_gross_cents and s.currency=h.currency
    as source_identity_matches,
   s.sale_state as current_sale_state,
   s.sale_state is distinct from h.source_payment_state
    as payment_state_changed,
   h.record_status='held_unverified' and
   h.payment_authorized=false and h.fulfillment_authorized=false
    as held_without_release,
   a.order_id is not null and a.expected_line_count>0 and
    a.source_gross_cents=h.source_gross_cents and
    a.line_subtotal_cents+a.shipping_cents-a.discount_cents=
      h.source_gross_cents and
    a.expected_line_count=(
      select count(*) from apex_internal.order_line_snapshots l
      where l.store_id=h.store_id and l.order_id=h.id) and
    a.line_subtotal_cents=(
      select coalesce(sum(l.line_subtotal_cents),0)
      from apex_internal.order_line_snapshots l
      where l.store_id=h.store_id and l.order_id=h.id) and
    exists(select 1 from apex_internal.held_order_intake_audit t
      where t.store_id=h.store_id and t.order_id=h.id
       and t.event_type='snapshot_held'
       and t.source_sha256=h.source_event_sha256) and
    exists(select 1 from apex_internal.order_delivery_envelopes d
      where d.store_id=h.store_id and d.order_id=h.id
       and d.shipping_authorized=false and d.delivery_verified=false)
    as held_accounting_complete
  from apex_internal.order_detail_snapshots h
  left join public.supplier_sales_history s
   on s.id=h.sale_id and s.store_id=h.store_id
  left join apex_internal.held_order_intake_accounting a
   on a.store_id=h.store_id and a.order_id=h.id
  where h.store_id=p_store_id
 )
 select count(*)::integer,
  count(*) filter (where source_identity_matches and
   current_sale_state='confirmed')::integer,
  count(*) filter (where current_sale_state is distinct from 'confirmed')::integer,
  count(*) filter (where source_identity_matches is distinct from true
   or payment_state_changed)::integer,
  count(*) filter (where held_accounting_complete and held_without_release
   and source_identity_matches and not payment_state_changed)::integer,
  count(*) filter (where held_accounting_complete is distinct from true
   or held_without_release is distinct from true
   or source_identity_matches is distinct from true
   or payment_state_changed)::integer
 into v_total,v_confirmed,v_nonconfirmed,v_source_drift,v_complete,v_incomplete
 from source;
 select count(*)::integer,
  count(*) filter (where product_eligibility='not_verified'
   or shipping_authorized=false)::integer
 into v_accounted_lines,v_lines_unverified
 from apex_internal.order_line_snapshots l
 where l.store_id=p_store_id;
 if v_total>100 or v_accounted_lines>1000 then
  raise exception 'Eligible-report review exceeded bounded source'
   using errcode='54000';end if;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'source','canonical_sales_and_held_snapshots',
  'original_held_order_count',v_total,
  'recorded_current_confirmed_sales',v_confirmed,
  'recorded_nonconfirmed_sales',v_nonconfirmed,
  'source_drift_or_state_changed',v_source_drift,
  'complete_held_for_review',v_complete,
  'incomplete_or_changed_held_records',v_incomplete,
  'original_line_count',v_accounted_lines,
  'lines_without_product_shipping_approval',v_lines_unverified,
  -- No independent finality/eligibility/release evidence is available
  -- in this model. These zeros must not be inferred from the sale state.
  'independently_settled_and_eligible_order_count',0,
  'withheld_from_actionable_report',v_total,
  'verified_destination_release_count',0,
  'independent_payment_finality_present',false,
  'product_transport_eligibility_present',false,
  'authorized_delivery_release_present',false,
  'source_consistent_for_review',v_source_drift=0 and v_incomplete=0,
  'may_email_actionable_orders',false,
  'may_purchase_label',false,
  'may_mark_shipped',false,
  'synthetic_only',true
 );
end $fn$;

revoke all on function public.get_supplier_review_report_evidence_gate(uuid)
 from public,anon,authenticated;
grant execute on function public.get_supplier_review_report_evidence_gate(uuid)
 to authenticated;
do $postflight$
begin
 if has_function_privilege('anon',
  'public.get_supplier_review_report_evidence_gate(uuid)','EXECUTE')
 or has_table_privilege('authenticated',
  'apex_internal.order_detail_snapshots','SELECT')
 or has_table_privilege('authenticated',
  'apex_internal.order_line_snapshots','SELECT')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Review evidence gate leaked source access';end if;
end $postflight$;
commit;
