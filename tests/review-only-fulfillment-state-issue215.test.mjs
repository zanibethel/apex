import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FULFILLMENT_STATES,reviewFulfillmentTransition,
 summarizeReviewAllocations,
} from '../src/lib/supplier/review-only-fulfillment-state.mjs';
const orderLine1='67000215-0000-4000-8000-000000000001';
const orderLine2='67000215-0000-4000-8000-000000000002';

test('all desired states are enumerated but no transition grants shipment',()=>{
 assert.deepEqual([...FULFILLMENT_STATES],
 ['queued','under_review','packing','label_ready','shipped',
 'delivered','exception','cancelled']);
 for(const from of FULFILLMENT_STATES){
  for(const to of FULFILLMENT_STATES){
   const result=reviewFulfillmentTransition({
    from,to,expectedRevision:2,observedRevision:2,
    eligibilityApproved:true,transportApproved:true,
    sourceApproved:true,shippingAuthorized:true,
   });
   assert.equal(result.canTransition,false);
   assert.equal(result.canPurchaseLabel,false);
   assert.equal(result.canShip,false);
   assert.equal(result.canDeliver,false);
   assert.equal(result.commitAllowed,false);
  }
 }
});
test('stale/invalid version is explicit and blocks silent overwrites',()=>{
 const stale=reviewFulfillmentTransition({
  from:'packing',to:'label_ready',expectedRevision:1,observedRevision:2,
 });
 assert.equal(stale.status,'stale_version');
 assert.equal(stale.observedRevision,2);
 assert.equal(stale.canTransition,false);
 assert.equal(reviewFulfillmentTransition({
  from:'queued',to:'under_review',expectedRevision:0,observedRevision:1,
 }).status,'invalid_version');
 assert.equal(reviewFulfillmentTransition({
  from:'queued',to:'delivered',expectedRevision:1,observedRevision:1,
 }).status,'unsupported_transition');
 assert.equal(reviewFulfillmentTransition({
  from:'not_real',to:'shipped',expectedRevision:1,observedRevision:1,
 }).status,'unknown_state');
});
test('partial plan distinguishes requested from unplanned units',()=>{
 const summary=summarizeReviewAllocations([
  {lineId:orderLine1,purchasedQuantity:3,plannedQuantity:1,newPlanQuantity:1},
  {lineId:orderLine2,purchasedQuantity:2,plannedQuantity:0,newPlanQuantity:1},
 ]);
 assert.ok(summary);
 assert.equal(summary.requestedUnits,2);
 assert.equal(summary.alreadyPlannedUnits,1);
 assert.equal(summary.remainingUnplannedUnits,2);
 assert.equal(summary.partiallyPlanned,true);
 assert.equal(summary.lines[0].remainingUnplannedQuantity,1);
 assert.equal(summary.lines[1].remainingUnplannedQuantity,1);
 assert.equal(summary.canShip,false);
 assert.equal(summary.canReserveInventory,false);
 assert.equal(summary.plannedOnly,true);
});
test('full allocation still never constitutes shipped or delivered',()=>{
 const full=summarizeReviewAllocations([
  {lineId:orderLine1,purchasedQuantity:3,plannedQuantity:1,newPlanQuantity:2},
 ]);
 assert.ok(full);
 assert.equal(full.remainingUnplannedUnits,0);
 assert.equal(full.partiallyPlanned,false);
 assert.equal(full.canShip,false);
});
test('over-allocation, duplicate lines and unverifiable sources fail closed',()=>{
 assert.equal(summarizeReviewAllocations([
  {lineId:orderLine1,purchasedQuantity:2,plannedQuantity:1,newPlanQuantity:2},
 ]),null);
 assert.equal(summarizeReviewAllocations([
  {lineId:orderLine1,purchasedQuantity:2,plannedQuantity:0,newPlanQuantity:1},
  {lineId:orderLine1,purchasedQuantity:2,plannedQuantity:0,newPlanQuantity:1},
 ]),null);
 assert.equal(summarizeReviewAllocations([
  {lineId:orderLine2,purchasedQuantity:0,plannedQuantity:0,newPlanQuantity:0},
 ]),null);
 assert.equal(summarizeReviewAllocations([
  {lineId:orderLine2,purchasedQuantity:2,plannedQuantity:0,newPlanQuantity:1,
   address:'extra'},
 ]),null);
 assert.equal(summarizeReviewAllocations([]),null);
});
test('review model never creates real payment, delivery, carrier or database calls',()=>{
 const source=readFileSync('src/lib/supplier/review-only-fulfillment-state.mjs','utf8');
 assert.doesNotMatch(source,/fetch\(|process\.env|NEXT_PUBLIC_|createClient|\.rpc\(|purchaseLabel|createInvoice|decryptAddress/);
 assert.match(source,/canShip:false/);
});
