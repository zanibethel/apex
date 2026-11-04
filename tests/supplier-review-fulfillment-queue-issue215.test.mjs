import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSupplierReviewFulfillmentQueue} from '../src/lib/supplier/review-fulfillment-queue.mjs';
const store='62000000-0000-0000-0000-000000000001';
const foreign='62000000-0000-0000-0000-000000000002';
const first={
 order_id:'66000215-0000-4000-8000-000000000001',
 order_reference:'SYNTH-QUEUE-215-A',
 purchased_at_utc:'2026-11-04T12:00:00.000Z',
 readiness:'held_review_only',
 lines:[
  {line_number:1,sku:'SKU-A',title:'Synthetic sample A',variant:'',
   purchased_quantity:2,planned_quantity:1,unplanned_quantity:1},
  {line_number:2,sku:'SKU-B',title:'Synthetic sample B',variant:'',
   purchased_quantity:1,planned_quantity:1,unplanned_quantity:0},
 ],
 plans:[
  {shipment_id:'71000215-0000-4000-8000-000000000001',
   reference:'PLAN-215-A',revision:2,status:'review_only',
   planned_units:2,tracking_drafts:[
    {carrier:'USPS',tracking_reference:'94000000000000000215',
     revision:2,recorded_at_utc:'2026-11-04T13:00:00.000Z'},
   ],can_ship:false,can_buy_label:false},
 ],
 purchased_units:3,planned_units:2,unplanned_units:1,
 can_ship:false,can_buy_label:false,can_enter_tracking:false,
};
const incomplete={
 ...first,order_id:'66000215-0000-4000-8000-000000000002',
 order_reference:'SYNTH-QUEUE-215-PENDING',
 purchased_at_utc:'2026-11-04T14:00:00.000Z',
 readiness:'incomplete_held_record',lines:[],plans:[],
 purchased_units:null,planned_units:null,unplanned_units:null,
};
const response=(orders=[incomplete,first],extra={})=>({
 schema_version:1,store_id:store,source:'synthetic_held_review',
 total:orders.length,limit:10,offset:0,has_more:false,orders,
 shipping_enabled:false,label_purchase_enabled:false,
 tracking_entry_enabled:false,delivery_decryption_enabled:false,...extra,
});
const parse=(val,s=store,args={})=>parseSupplierReviewFulfillmentQueue(val,s,args);
test('partial line and tracking proposals remain held, not shipped',()=>{
 const parsed=parse(response());
 assert.ok(parsed);
 assert.equal(parsed.total,2);
 assert.equal(parsed.orders[0].readiness,'incomplete');
 assert.equal(parsed.orders[0].plans.length,0);
 assert.equal(parsed.orders[1].purchasedUnits,3);
 assert.equal(parsed.orders[1].plannedUnits,2);
 assert.equal(parsed.orders[1].unplannedUnits,1);
 assert.equal(parsed.orders[1].lines[0].unplanned,1);
 assert.equal(parsed.orders[1].lines[1].unplanned,0);
 assert.equal(parsed.orders[1].plans[0].plannedUnits,2);
 assert.equal(parsed.orders[1].plans[0].drafts[0].carrier,'USPS');
 assert.equal(parsed.orders[1].plans[0].drafts[0].revision,2);
 assert.equal(parsed.orders[1].canShip,false);
 assert.equal(parsed.canEnterTracking,false);
 assert.equal(parsed.sourceAuthoritative,false);
 assert.equal(Object.isFrozen(parsed.orders[1].plans[0].drafts),true);
});
test('wrong supplier or fields, PII, and authorization injections fail closed',()=>{
 assert.equal(parse(response(),foreign),null);
 assert.equal(parse({...response(),customer_email:'private'}),null);
 assert.equal(parse(response([first],{orders:[{...first,delivery_ciphertext:'secret'}]})),null);
 assert.equal(parse(response([first],{orders:[{...first,can_ship:true}]})),null);
 assert.equal(parse(response([first],{orders:[{...first,plans:[
  {...first.plans[0],tracking_drafts:[{...first.plans[0].tracking_drafts[0],
   recipient_address:'sensitive'}]},
 ]}]})),null);
 assert.equal(parse(response([], {shipping_enabled:true})),null);
 assert.equal(parse(response([], {source:'live_order_paid'})),null);
});
test('incomplete order never presents unverified line or planned quantity',()=>{
 assert.equal(parse(response([{...incomplete,lines:first.lines}])),null);
 assert.equal(parse(response([{...incomplete,purchased_units:3}])),null);
 assert.equal(parse(response([{...incomplete,plans:first.plans}])),null);
});
test('line counts and sums must reconcile with immutable purchase, not shipment',()=>{
 for(const change of [
  {planned_units:3},
  {purchased_units:99},
  {unplanned_units:0},
  {lines:[{...first.lines[0],planned_quantity:3},first.lines[1]]},
  {lines:[{...first.lines[0],unplanned_quantity:0},first.lines[1]]},
  {lines:[first.lines[0],{...first.lines[1],line_number:1}]},
  {plans:[]},
  {plans:[{...first.plans[0],planned_units:1}]},
  {plans:[{...first.plans[0],revision:1}]},
  {plans:[{...first.plans[0],status:'shipped'}]},
  {plans:[{...first.plans[0],can_buy_label:true}]},
 ]) assert.equal(parse(response([first],{orders:[{...first,...change}]})),null);
});
test('repeated shipment IDs, tracking references and malformed history fail',()=>{
 const extraPlan={...first.plans[0],
  reference:'PLAN-215-B',shipment_id:'71000215-0000-4000-8000-000000000002',
  planned_units:1,tracking_drafts:[{
   ...first.plans[0].tracking_drafts[0],tracking_reference:'94000000000000000216',
  }],
 };
 const fully={...first,planned_units:3,unplanned_units:0,
  lines:[{...first.lines[0],planned_quantity:2,unplanned_quantity:0},first.lines[1]],
  plans:[first.plans[0],extraPlan],
 };
 assert.ok(parse(response([fully])));
 assert.equal(parse(response([fully],{orders:[{...fully,plans:[
  first.plans[0],{...extraPlan,shipment_id:first.plans[0].shipment_id},
 ]}]})),null);
 assert.equal(parse(response([fully],{orders:[{...fully,plans:[
  first.plans[0],{...extraPlan,tracking_drafts:first.plans[0].tracking_drafts},
 ]}]})),null);
 assert.equal(parse(response([first],{orders:[{...first,plans:[
  {...first.plans[0],tracking_drafts:[{
   ...first.plans[0].tracking_drafts[0],revision:3,
  }]},
 ]}]})),null);
 assert.equal(parse(response([first],{orders:[{...first,plans:[
  {...first.plans[0],tracking_drafts:[{
   ...first.plans[0].tracking_drafts[0],tracking_reference:'<script>'}]},
 ]}]})),null);
});
test('pagination and immutable purchase time are strictly descending',()=>{
 const one=response([first],{total:2,limit:1,has_more:true});
 assert.equal(parse(one,store,{limit:1}).hasMore,true);
 assert.equal(parse(one,store,{limit:1,offset:1}),null);
 assert.equal(parse(response([first,incomplete])),null);
 assert.equal(parse(response([incomplete,incomplete])),null);
 assert.equal(parse(response([],{total:1,has_more:true})),null);
 assert.equal(parse(response([first],{total:2,has_more:false})),null);
 assert.equal(parse(response([], {limit:100})),null);
});
test('display model contains no PII, write calls or carrier integrations',()=>{
 const model=JSON.stringify(parse(response()));
 assert.doesNotMatch(model,/address|nonce|ciphertext|key_reference|source_sha256|customer_email/);
 const code=readFileSync('src/lib/supplier/review-fulfillment-queue.mjs','utf8');
 assert.doesNotMatch(code,/process\.env|fetch\(|\.rpc\(|createClient|purchaseLabel|createInvoice|decryptAddress/);
 assert.match(code,/canShip:false/);
});
