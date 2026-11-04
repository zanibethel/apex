-- Issue #217 Phase 2: no held sale can become an actionable shipping
-- report, regardless of recorded sale state or planning quantity.
\set ON_ERROR_STOP on
do $preflight$
begin
 if current_database()<>'apex_test'
 or to_regprocedure('public.get_supplier_review_report_evidence_gate(uuid)') is null
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Evidence gate test requires disposable apex_test';end if;
end $preflight$;

begin;
do $setup$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 total integer;
begin
 select count(*)::integer into total
 from apex_internal.order_detail_snapshots where store_id=s;
 if total<1 then raise exception 'Missing held synthetic source fixture';end if;
 perform set_config('apex.test.evidence_baseline',total::text,true);
end $setup$;

set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $original$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 v jsonb;
 expected integer:=current_setting('apex.test.evidence_baseline')::integer;
 denied boolean;
begin
 v:=public.get_supplier_review_report_evidence_gate(s);
 if v->>'schema_version'<>'1' or v->>'store_id'<>s::text
 or v->>'source'<>'canonical_sales_and_held_snapshots'
 or (v->>'original_held_order_count')::integer<>expected
 or (v->>'withheld_from_actionable_report')::integer<>expected
 or v->>'independently_settled_and_eligible_order_count'<>'0'
 or v->>'verified_destination_release_count'<>'0'
 or v->>'independent_payment_finality_present'<>'false'
 or v->>'product_transport_eligibility_present'<>'false'
 or v->>'authorized_delivery_release_present'<>'false'
 or v->>'may_email_actionable_orders'<>'false'
 or v->>'may_purchase_label'<>'false'
 or v->>'may_mark_shipped'<>'false'
 or v->>'synthetic_only'<>'true'
 or v->>'lines_without_product_shipping_approval'<>
    v->>'original_line_count'
 then raise exception 'Evidence gate falsely released a held order';end if;
 if v::text ~ '(recipient|address|ciphertext|source_sha256|email@|SKU-TEST|carrier)'
 then raise exception 'Evidence gate leaked private order data';end if;
 denied:=false;
 begin perform public.get_supplier_review_report_evidence_gate(
  '62000000-0000-0000-0000-000000000002');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier accessed other store evidence';end if;
 denied:=false;
 begin perform 1 from apex_internal.order_detail_snapshots limit 1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Direct private order table became readable';end if;
end $original$;
reset role;

-- Create a plausible-but-incomplete synthetic sale and held header. It
-- must increase the held/missing-evidence counts, not eligible orders.
insert into public.supplier_sales_history(
 id,store_id,order_reference,sale_state,gross_cents,currency,occurred_at)
values('65000917-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 'SYNTH-EVIDENCE-INCOMPLETE','pending',7000,'USD',
 '2026-11-04T19:10:00Z');
insert into apex_internal.order_detail_snapshots(
 id,store_id,sale_id,source_order_reference,original_purchased_at,
 source_payment_state,source_gross_cents,source_event_sha256)
values('66000917-0000-4000-8000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '65000917-0000-4000-8000-000000000001',
 'SYNTH-EVIDENCE-INCOMPLETE','2026-11-04T19:10:00Z',
 'pending',7000,repeat('f',64));
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $incomplete$
declare v jsonb; baseline integer:=
 current_setting('apex.test.evidence_baseline')::integer;
begin
 v:=public.get_supplier_review_report_evidence_gate(
  '62000000-0000-0000-0000-000000000001');
 if (v->>'original_held_order_count')::integer<>baseline+1
 or (v->>'withheld_from_actionable_report')::integer<>baseline+1
 or (v->>'incomplete_or_changed_held_records')::integer<1
 or (v->>'recorded_nonconfirmed_sales')::integer<1
 or v->>'independently_settled_and_eligible_order_count'<>'0'
 or v->>'source_consistent_for_review'<>'false'
 or v->>'may_email_actionable_orders'<>'false'
 then raise exception 'Incomplete source fabricated eligibility';end if;
end $incomplete$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $outsider$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_report_evidence_gate(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign supplier saw order evidence';end if;
end $outsider$;
rollback;
begin;
set local role anon;
do $anon$
declare denied boolean:=false;
begin
 begin perform public.get_supplier_review_report_evidence_gate(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous accessed source readiness';end if;
end $anon$;
rollback;

do $postflight$
begin
 if exists(select 1 from apex_internal.order_detail_snapshots
  where id='66000917-0000-4000-8000-000000000001')
 or exists(select 1 from public.supplier_sales_history
  where id='65000917-0000-4000-8000-000000000001')
 or (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Eligibility fixture mutated persistent state';end if;
end $postflight$;
select 'PASS: original sale confirmation never equals independent eligibility, missing evidence withheld, supplier privacy';
