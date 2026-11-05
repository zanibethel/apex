import test from "node:test";
import assert from "node:assert/strict";
import {prepareCheckoutOrderHandoffV1,verifyHeldOrderReadbackV1}
 from "../src/lib/payments/checkout-order-handoff-v1.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const other="00000000-0000-4000-8000-000000000002";
const p1="00000000-0000-4000-8000-000000000010";
const p2="00000000-0000-4000-8000-000000000011";
const requestId="00000000-0000-4000-8000-000000000001";
const key="regtest-handoff-fixture-key-not-production-0123456789";
const delivery={firstName:"Ada",lastName:"Sample",email:"ADA@example.com",
 phone:"",address1:"123 Test Street",address2:"",city:"Testville",
 state:"TX",postalCode:"79401"};
const payload=()=>({schema_version:1,store_id:store,request_id:requestId,
 items:[{product_id:p2,quantity:1},{product_id:p1,quantity:2}],
 box_size:"auto",promotion_code:"",delivery:{...delivery}});
const prepare=value=>prepareCheckoutOrderHandoffV1(value,{
 trustedStoreId:store,fingerprintKey:key,
});

test("canonicalizes the actual cart payload without minting orders, charges or timestamps",()=>{
 const r=prepare(payload());
 assert.equal(r.ok,true);
 assert.equal(r.items[0].product_id,p1);
 assert.equal(r.unitCount,3);
 assert.equal(r.serverOnlyDelivery.email,"ada@example.com");
 assert.match(r.idempotencyHash,/^[a-f0-9]{64}$/);
 assert.equal(r.canonicalOrderId,null);
 assert.equal(r.originalPurchasedAt,null);
 assert.equal(r.canCreateOrder,false);
 assert.equal(r.canReserveStock,false);
 assert.equal(r.canCreateInvoice,false);
 assert.equal(r.canPay,false);
 assert.equal(prepare({...payload(),items:[...payload().items].reverse()})
  .requestFingerprint,r.requestFingerprint);
});

test("the same idempotency identity with altered cart, delivery or promotion is detectable",()=>{
 const original=prepare(payload());
 for(const altered of [
  {...payload(),items:[{product_id:p1,quantity:3}]},
  {...payload(),delivery:{...delivery,address1:"999 Test Street"}},
  {...payload(),promotion_code:"FREE_SHIP"},
  {...payload(),box_size:"medium"},
 ]){
  const r=prepare(altered);
  assert.equal(r.ok,true);
  assert.equal(r.idempotencyHash,original.idempotencyHash);
  assert.notEqual(r.requestFingerprint,original.requestFingerprint);
 }
 const distinct=prepare({...payload(),
  request_id:"00000000-0000-4000-8000-000000000003"});
 assert.notEqual(distinct.idempotencyHash,original.idempotencyHash);
});

test("cross-supplier, extra fields and client price/payment claims are rejected",()=>{
 const invalid=[
  {...payload(),store_id:other},
  {...payload(),total_cents:100},
  {...payload(),can_pay:true},
  {...payload(),items:[{product_id:p1,quantity:1,price:1}]},
  {...payload(),items:[{product_id:p1,quantity:1},{product_id:p1,quantity:2}]},
  {...payload(),items:[{product_id:p1,quantity:11}]},
  {...payload(),items:[]},
  {...payload(),promotion_code:"$FREE"},
  {...payload(),request_id:"ORDER-1"},
  {...payload(),delivery:{...delivery,creditCard:"123"}},
  {...payload(),delivery:{...delivery,postalCode:"unknown"}},
 ];
 for(const request of invalid){
  const r=prepare(request);
  assert.equal(r.ok,false);
  assert.equal(r.canCreateOrder,false);
  assert.equal(r.canPay,false);
 }
 assert.equal(prepareCheckoutOrderHandoffV1(payload(),{
  trustedStoreId:other,fingerprintKey:key,
 }).ok,false);
 assert.equal(prepareCheckoutOrderHandoffV1(payload(),{
  trustedStoreId:store,fingerprintKey:"short",
 }).ok,false);
});

test("held-order identity and purchase timestamp must come from a matching trusted DB readback",()=>{
 const handoff=prepare(payload());
 const raw={schema_version:1,store_id:store,
  order_id:"00000000-0000-4000-8000-000000000020",
  original_purchased_at:"2026-11-05T14:23:45.000Z",
  idempotency_hash:handoff.idempotencyHash,
  request_fingerprint:handoff.requestFingerprint,
  cart_fingerprint:handoff.cartFingerprint,
  line_count:2,unit_count:3,currency:"USD",state:"held_no_payment",
  can_pay:false,can_ship:false};
 const result=verifyHeldOrderReadbackV1(handoff,raw);
 assert.equal(result.orderId,raw.order_id);
 assert.equal(result.originalPurchasedAt,raw.original_purchased_at);
 assert.equal(result.canPay,false);
 for(const altered of [
  {...raw,store_id:other},
  {...raw,request_fingerprint:"f".repeat(64)},
  {...raw,idempotency_hash:"0".repeat(64)},
  {...raw,line_count:1},
  {...raw,can_pay:true},
  {...raw,can_ship:true},
  {...raw,state:"paid"},
  {...raw,original_purchased_at:"not-a-date"},
  {...raw,paid_at:"2026-11-05"},
 ]){
  assert.equal(verifyHeldOrderReadbackV1(handoff,altered),null);
 }
});

test("no public payment route or invoice-writer is introduced by the handoff module",async()=>{
 const {readFileSync}=await import("node:fs");
 const content=readFileSync(new URL("../src/lib/payments/checkout-order-handoff-v1.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(content,/\.insert\(|\.update\(|\.delete\(|fetch\(|service_role|NEXT_PUBLIC_/);
 assert.match(content,/canCreateInvoice:false,canPay:false/);
});
