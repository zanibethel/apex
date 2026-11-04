/**
 * Issue #217 Phase 2: strict, read-only supplier evidence gate.
 * The current source contains immutable HELD records and sale-history
 * observations, not independent payment/product/shipping authorization.
 * Never promote sale-state "confirmed" to an eligible/shippable order.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const COUNTS=[
 'original_held_order_count','recorded_current_confirmed_sales',
 'recorded_nonconfirmed_sales','source_drift_or_state_changed',
 'complete_held_for_review','incomplete_or_changed_held_records',
 'original_line_count','lines_without_product_shipping_approval',
 'independently_settled_and_eligible_order_count',
 'withheld_from_actionable_report','verified_destination_release_count',
];
const FLAGS=[
 'independent_payment_finality_present',
 'product_transport_eligibility_present',
 'authorized_delivery_release_present',
 'may_email_actionable_orders','may_purchase_label','may_mark_shipped',
];
const FIELDS=[
 'schema_version','store_id','source',...COUNTS,
 'source_consistent_for_review',...FLAGS,'synthetic_only',
];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=x=>obj(x)&&Object.keys(x).length===FIELDS.length&&
 FIELDS.every(k=>Object.hasOwn(x,k));
const nat=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000;
export function parseSupplierReportEligibilityEvidence(
 input,storeId,expectedOriginalOrders,
){
 if(!UUID.test(storeId??'')||
  !Number.isSafeInteger(expectedOriginalOrders)||
  expectedOriginalOrders<0||expectedOriginalOrders>100||
  !exact(input)||input.schema_version!==1||
  input.store_id!==storeId||
  input.source!=='canonical_sales_and_held_snapshots'||
  COUNTS.some(k=>!nat(input[k]))||
  input.original_held_order_count!==expectedOriginalOrders||
  input.complete_held_for_review+
   input.incomplete_or_changed_held_records!==expectedOriginalOrders||
  input.source_drift_or_state_changed>
   input.incomplete_or_changed_held_records||
  input.recorded_current_confirmed_sales+
   input.recorded_nonconfirmed_sales>expectedOriginalOrders||
  input.lines_without_product_shipping_approval>
   input.original_line_count||
  // In the held-order schema every line is *still* unapproved.
  input.lines_without_product_shipping_approval!==
   input.original_line_count||
  input.independently_settled_and_eligible_order_count!==0||
  input.withheld_from_actionable_report!==expectedOriginalOrders||
  input.verified_destination_release_count!==0||
  input.source_consistent_for_review!==(
   input.source_drift_or_state_changed===0&&
   input.incomplete_or_changed_held_records===0)||
  FLAGS.some(k=>input[k]!==false)||input.synthetic_only!==true)
  return null;
 return Object.freeze({
  storeId,originalOrders:expectedOriginalOrders,
  recordedConfirmedObservations:input.recorded_current_confirmed_sales,
  recordedNonconfirmedObservations:input.recorded_nonconfirmed_sales,
  sourceDriftOrStateChanged:input.source_drift_or_state_changed,
  completeHeldForReview:input.complete_held_for_review,
  incompleteOrChanged:input.incomplete_or_changed_held_records,
  originalLines:input.original_line_count,
  unapprovedLines:input.lines_without_product_shipping_approval,
  independentlyEligibleOrders:0,
  withheldOrders:expectedOriginalOrders,
  sourceConsistentForReview:input.source_consistent_for_review,
  canSendActionableEmail:false,canShip:false,
  canPurchaseLabel:false,canRevealDestination:false,
  sourceType:'synthetic_held_evidence',
 });
}
