import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSupplierReportEligibilityEvidence}
 from '../src/lib/supplier/report-eligibility-evidence.mjs';

const store='62000000-0000-0000-0000-000000000001';
const other='62000000-0000-0000-0000-000000000002';
const sample={
 schema_version:1,store_id:store,source:'canonical_sales_and_held_snapshots',
 original_held_order_count:2,
 recorded_current_confirmed_sales:1,
 recorded_nonconfirmed_sales:1,
 source_drift_or_state_changed:0,
 complete_held_for_review:1,
 incomplete_or_changed_held_records:1,
 original_line_count:3,
 lines_without_product_shipping_approval:3,
 independently_settled_and_eligible_order_count:0,
 withheld_from_actionable_report:2,
 verified_destination_release_count:0,
 independent_payment_finality_present:false,
 product_transport_eligibility_present:false,
 authorized_delivery_release_present:false,
 source_consistent_for_review:false,
 may_email_actionable_orders:false,
 may_purchase_label:false,may_mark_shipped:false,
 synthetic_only:true,
};
const parse=(value=sample,storeId=store,expectedOrders=2)=>
 parseSupplierReportEligibilityEvidence(value,storeId,expectedOrders);

test('confirmed sale-history state does not grant independent fulfillment eligibility',()=>{
 const p=parse();
 assert.ok(p);
 assert.equal(p.recordedConfirmedObservations,1);
 assert.equal(p.independentlyEligibleOrders,0);
 assert.equal(p.withheldOrders,2);
 assert.equal(p.canSendActionableEmail,false);
 assert.equal(p.canShip,false);
 assert.equal(p.canPurchaseLabel,false);
 assert.equal(p.canRevealDestination,false);
 assert.equal(p.sourceConsistentForReview,false);
 assert.equal(Object.isFrozen(p),true);
});
test('a complete original held source still cannot be emailed as shipping-ready',()=>{
 const p=parse({...sample,
  recorded_current_confirmed_sales:2,
  recorded_nonconfirmed_sales:0,
  complete_held_for_review:2,
  incomplete_or_changed_held_records:0,
  source_consistent_for_review:true,
 });
 assert.ok(p);
 assert.equal(p.recordedConfirmedObservations,2);
 assert.equal(p.independentlyEligibleOrders,0);
 assert.equal(p.withheldOrders,2);
 assert.equal(p.canSendActionableEmail,false);
});
test('forged independently authorized shipping, payment, or email flags rejected',()=>{
 for(const change of [
  {independently_settled_and_eligible_order_count:1},
  {withheld_from_actionable_report:1},
  {verified_destination_release_count:1},
  {independent_payment_finality_present:true},
  {product_transport_eligibility_present:true},
  {authorized_delivery_release_present:true},
  {may_email_actionable_orders:true},
  {may_purchase_label:true},
  {may_mark_shipped:true},
  {synthetic_only:false},
  {shipping_address:'Private customer info'},
 ])assert.equal(parse({...sample,...change}),null);
});
test('source count changes, missing records and cross-store evidence fail closed',()=>{
 for(const change of [
  {original_held_order_count:3},
  {complete_held_for_review:2},
  {incomplete_or_changed_held_records:2},
  {source_drift_or_state_changed:2},
  {recorded_current_confirmed_sales:2,recorded_nonconfirmed_sales:1},
  {original_line_count:2},
  {source_consistent_for_review:true},
  {recorded_current_confirmed_sales:'1'},
  {source:'browser_cart_quote'},
  {store_id:other},
  {schema_version:2},
 ])assert.equal(parse({...sample,...change}),null);
 assert.equal(parse(sample,other),null);
 assert.equal(parse(sample,store,3),null);
 assert.equal(parse(null),null);
});
test('empty store remains blocked unless membership scoped source proves it empty',()=>{
 const blank={...sample,
  original_held_order_count:0,
  recorded_current_confirmed_sales:0,
  recorded_nonconfirmed_sales:0,
  complete_held_for_review:0,
  incomplete_or_changed_held_records:0,
  original_line_count:0,
  lines_without_product_shipping_approval:0,
  withheld_from_actionable_report:0,
  source_consistent_for_review:true,
 };
 const p=parse(blank,store,0);
 assert.ok(p);
 assert.equal(p.canSendActionableEmail,false);
});
test('supplier preview revalidates original relational evidence and never authorizes mail or shipping',()=>{
 const page=readFileSync('src/app/supplier/reports/fulfillment/email-preview/page.tsx','utf8');
 const source=readFileSync('src/lib/supplier/report-eligibility-evidence.mjs','utf8');
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/readCompleteReviewWorkbook/);
 assert.match(page,/get_supplier_review_report_evidence_gate/);
 assert.match(page,/parseSupplierReportEligibilityEvidence/);
 assert.match(page,/withheld from actionable|Withheld from actionable/i);
 assert.doesNotMatch(page,/sendEmail\(|purchaseLabel\(|decryptAddress\(|service_role/);
 assert.doesNotMatch(source,/fetch\(|process\.env|createClient|sendEmail|purchaseLabel/);
});
