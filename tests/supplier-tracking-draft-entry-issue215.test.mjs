import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 parseSupplierTrackingDraftRequest,
 parseSupplierTrackingDraftReceipt,
} from '../src/lib/supplier/review-tracking-draft-contract.mjs';

const store='62000000-0000-0000-0000-000000000001';
const plan='71000215-0000-4000-8000-000000000001';
const request='70000215-0000-4000-8000-000000000991';

function input(changes={}){
 return {storeId:store,shipmentId:plan,requestId:request,
  expectedRevision:2,carrier:'USPS',
  trackingReference:' 94000000000000000991 ',...changes};
}
function receipt(changes={}){
 return {status:'draft_saved',expected_revision:2,
  observed_revision:3,latest_carrier:'USPS',
  latest_tracking_reference:'94000000000000000991',
  shipped:false,carrier_verified:false,
  label_purchased:false,...changes};
}

test('supplier draft request accepts only canonical IDs, revision, carrier and reference',()=>{
 const parsed=parseSupplierTrackingDraftRequest(input());
 assert.ok(parsed);
 assert.equal(parsed.trackingReference,'94000000000000000991');
 assert.equal(parsed.expectedRevision,2);
 assert.equal(parsed.storeId,store);
 assert.equal(Object.isFrozen(parsed),true);
 for(const change of [
  {storeId:'not-a-store'}, {shipmentId:'bad'},
  {requestId:null},{expectedRevision:0},{expectedRevision:1000},
  {expectedRevision:'2'}, {carrier:'UNKNOWN'},
  {trackingReference:'<script>'},
  {trackingReference:'1234'}, {trackingReference:'X'.repeat(41)},
  {deliveryAddress:'personal'},
 ]) assert.equal(parseSupplierTrackingDraftRequest(input(change)),null);
 assert.equal(parseSupplierTrackingDraftRequest(null),null);
 assert.equal(parseSupplierTrackingDraftRequest([]),null);
});
test('safe save and exact replay receipts cannot imply shipping or carrier validation',()=>{
 for(const status of ['draft_saved','identical_replay']){
  const v=parseSupplierTrackingDraftReceipt(receipt({status}),2);
  assert.ok(v);
  assert.equal(v.kind,status);
  assert.equal(v.expectedRevision,2);
  assert.equal(v.observedRevision,3);
  assert.equal(v.canShip,false);
  assert.equal(v.canBuyLabel,false);
  assert.equal(v.canMarkDelivered,false);
  assert.equal(Object.isFrozen(v),true);
 }
});
test('stale revision returns explicit previous and current revisions, latest proposal',()=>{
 const v=parseSupplierTrackingDraftReceipt(
  receipt({status:'stale_version',expected_revision:1,observed_revision:3}),1);
 assert.ok(v);
 assert.equal(v.kind,'stale_version');
 assert.equal(v.expectedRevision,1);
 assert.equal(v.observedRevision,3);
 assert.equal(v.latestCarrier,'USPS');
 assert.equal(v.latestTracking,'94000000000000000991');
});
test('changed or reused event ID is a conflict, not a successful update',()=>{
 const v=parseSupplierTrackingDraftReceipt(
  receipt({status:'duplicate_conflict',observed_revision:2}),2);
 assert.equal(v.kind,'duplicate_conflict');
 assert.equal(v.canShip,false);
 assert.equal(v.canBuyLabel,false);
});
test('forged authorization flags, unexpected details and malformed revisions fail closed',()=>{
 for(const change of [
  {shipped:true},{carrier_verified:true},{label_purchased:true},
  {recipient_name:'Secret'},
  {status:'shipped'}, {status:'delivered'},
  {observed_revision:0}, {expected_revision:4},
  {latest_carrier:'UNKNOWN'},
  {latest_tracking_reference:'<script>'},
  {latest_tracking_reference:null},
  {status:'draft_saved',observed_revision:2},
 ]) assert.equal(parseSupplierTrackingDraftReceipt(receipt(change),2),null);
 assert.equal(parseSupplierTrackingDraftReceipt(receipt(),1),null);
 assert.equal(parseSupplierTrackingDraftReceipt(null,2),null);
});
test('server action uses verified supplier workspace, not privileged service client',()=>{
 const source=readFileSync('src/app/supplier/fulfillment/actions.ts','utf8');
 assert.match(source,/getSupplierWorkspace/);
 assert.match(source,/m\.role==="owner"\|\|m\.role==="manager"/);
 assert.match(source,/submit_supplier_review_tracking_draft/);
 assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE|decryptAddress|purchaseLabel|createInvoice|shipOrder/);
 const client=readFileSync('src/app/supplier/fulfillment/review-tracking-draft-form.tsx','utf8');
 assert.match(client,/useActionState/);
 assert.match(client,/expectedRevision/);
 assert.match(client,/Save tracking draft/);
 assert.doesNotMatch(client,/purchaseLabel|createInvoice/);
});
