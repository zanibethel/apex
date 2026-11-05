import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareTrack1CheckoutHandoffForTrack2V1,TRACK2_CHECKOUT_MAX_LINES}
 from "../src/lib/checkout/track1-to-track2-adapter-v1.mjs";
const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const otherStore="00000000-0000-4000-8000-000000000099";
const key="contract-fixture-track2-only-key-01234567890123";
const rid="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const details={firstName:"Ada",lastName:"Example",email:"ADA@example.com",
 phone:"",address1:"100 Main Street",address2:"",city:"Lubbock",
 state:"TX",postalCode:"79401"};
const product=i=>"00000000-0000-4000-8000-"+String(i).padStart(12,"0");
const payload=(length=2)=>({
 schemaVersion:1,requestId:rid,
 cart:{items:Array.from({length},(_,i)=>({
  product_id:product(i+10),quantity:1,
 })),code:"SHIPFREE",boxSize:"auto"},
 delivery:details,
});
const prepare=(raw,options={})=>prepareTrack1CheckoutHandoffForTrack2V1(raw,{
 trustedStoreId:store,fingerprintKey:key,...options,
});

test("client v1 is converted to exact Track 2 server-only canonical handoff",()=>{
 const received=prepare(payload());
 assert.equal(received.ok,true);
 assert.equal(received.status,"validated_not_admitted");
 assert.equal(received.storeId,store);
 assert.equal(received.requestId,rid);
 assert.equal(received.items.length,2);
 assert.equal(received.promotionCode,"SHIPFREE");
 assert.equal(received.boxSize,"auto");
 assert.equal(received.serverOnlyDelivery.email,"ada@example.com");
 assert.match(received.cartFingerprint,/^[0-9a-f]{64}$/);
 assert.equal(received.canCreateOrder,false);
 assert.equal(received.canCreateInvoice,false);
 assert.equal(received.canReserveStock,false);
 assert.equal(received.canPay,false);
});

test("reject 9–20 items without truncation, while accepting exactly 8",()=>{
 assert.equal(TRACK2_CHECKOUT_MAX_LINES,8);
 assert.equal(prepare(payload(8)).ok,true);
 for(const n of [9,20]){
  const result=prepare(payload(n));
  assert.equal(result.ok,false);
  assert.match(result.reason,/8 distinct products/);
  assert.equal(result.canCreateOrder,false);
 }
});

test("same request id changes fingerprint when cart, discount or protected address changes",()=>{
 const initial=prepare(payload());
 for(const alternate of [
  {...payload(),cart:{...payload().cart,code:"PROMO10"}},
  {...payload(),delivery:{...details,address1:"200 Main Street"}},
  {...payload(),cart:{...payload().cart,items:[
   {product_id:product(10),quantity:2},{product_id:product(11),quantity:1},
  ]}},
 ]){
  const updated=prepare(alternate);
  assert.equal(updated.ok,true);
  assert.equal(updated.idempotencyHash,initial.idempotencyHash);
  assert.notEqual(updated.requestFingerprint,initial.requestFingerprint);
 }
});

test("client cannot supply amounts, stock, payment authority, or store identity",()=>{
 for(const invalid of [
  {...payload(),store_id:store},
  {...payload(),cart:{...payload().cart,amount_cents:1}},
  {...payload(),delivery:{...details,cardNumber:"1234"}},
  {...payload(),cart:{...payload().cart,items:[{product_id:product(10),quantity:1,unitPriceCents:1}]}},
 ]){
  assert.equal(prepare(invalid).ok,false);
 }
 assert.equal(prepare(payload(),{trustedStoreId:otherStore}).ok,true);
 // Trusted store identity is injected by caller; no browser-sourced store ID.
 assert.equal(prepare(payload(),{fingerprintKey:"short"}).ok,false);
 const src=readFileSync("src/lib/checkout/track1-to-track2-adapter-v1.mjs","utf8");
 assert.doesNotMatch(src,/\.insert\(|fetch\(|\.update\(|createInvoice\(|localStorage|console\./);
 assert.match(src,/prepareCheckoutOrderHandoffV1/);
});
