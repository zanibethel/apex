import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {preparePrivateRetailHoldWithDeliveryV1}
 from "../src/lib/checkout/private-retail-hold-coordinator-v1.mjs";
import {openPrivateOrderDeliveryV1}
 from "../src/lib/payments/private-order-delivery-envelope-v1.mjs";

const storeId="10000000-0000-4000-8000-000000000001";
const orderId="80000000-0000-4000-8000-000000000009";
const requestId="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const sessionId="9819cbcc-5e4b-4b33-aa12-8d78af338702";
const productId="50000000-0000-4000-8000-000000000001";
const fingerprintKey="test-only-session-fingerprint-key-should-not-be-used";
const encryptionKey=randomBytes(32);
const delivery={
 firstName:"Sample",lastName:"Customer",email:"sample@example.invalid",
 phone:"",address1:"123 Example Street",address2:"",
 city:"Fictiontown",state:"TX",postalCode:"79401",
};
const raw={
 schemaVersion:1,requestId,cart:{
  items:[{product_id:productId,quantity:1}],
  code:"",boxSize:"auto",
 },delivery,
};
const source={
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:productId,quantity:1,name:"Cotton Workout Shirt",
  unit_price_cents:"3200",availability:"in_stock",can_checkout:false}],
 shipping:{charge_shipping:true,flat_shipping_cents:1500,
  medium_flat_shipping_cents:2580,
  free_shipping_min_subtotal_cents:20001,envelope_max_items:4},
 requested_code:"",promotion:null,
 can_place_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,
};
const when="2026-11-14T00:00:00.000Z";
const expires="2026-11-14T00:15:00.000Z";
const defaults={
 trustedStoreId:storeId,fingerprintKey,
 verifiedSession:{verified:true,subjectId:sessionId},
 deliveryKeyReference:"key_demo_1",deliveryKey:encryptionKey,
};
function makeTx({replay=false,failAt="",sealedAlready=true}={}){
 const calls=[],staged=[],committed=[];
 const stagedEnvelope={value:null};
 const receipt={
  schema_version:1,order_id:orderId,store_id:storeId,
  created_at:when,expires_at:expires,
  status:"held_no_payment",currency:"USD",line_count:1,unit_count:1,
  merchandise_cents:"3200",discount_cents:"0",shipping_cents:"1500",
  total_cents:"4700",delivery_sealed:true,
  can_pay:false,can_ship:false,invoice_created:false,payment_confirmed:false,
 };
 const methods={
  async quoteSource(v){
   calls.push(["quote",v]);if(failAt==="quote")throw Error("Quote failed");
   return source;
  },
  async reserve(v){
   calls.push(["reserve",v]);
   if(failAt==="reserve")throw Error("Reservation failed");
   staged.push({type:"reservation",id:orderId});
   return {schema_version:1,order_id:orderId,status:"held_no_payment",
    replayed:replay,total_cents:"4700",can_pay:false,
    can_ship:false,invoice_created:false};
  },
  async attachDelivery(v){
   calls.push(["seal",v]);if(failAt==="seal")throw Error("Attachment failed");
   stagedEnvelope.value=v;
   staged.push({type:"envelope",id:v.orderId});
   return {schema_version:1,order_id:orderId,sealed:true,replayed:false,
    can_pay:false,can_ship:false};
  },
  async receipt(v){
   calls.push(["receipt",v]);if(failAt==="receipt")throw Error("Receipt failed");
   return {...receipt,delivery_sealed:replay?sealedAlready:stagedEnvelope.value!==null};
  },
 };
 const withTransaction=async work=>{
  calls.push(["begin"]);
  try{
   const value=await work(methods);
   committed.push(...staged);
   calls.push(["commit"]);
   return value;
  }catch(e){calls.push(["rollback"]);throw e;}
 };
 return {withTransaction,calls,committed,stagedEnvelope};
}
const run=(tx,options={})=>preparePrivateRetailHoldWithDeliveryV1(raw,{
 ...defaults,...options,withTransaction:tx.withTransaction,
});

test("secure order handoff seals private delivery inside the transaction and returns no PII",async()=>{
 const tx=makeTx();
 const result=await run(tx);
 assert.deepEqual(tx.calls.map(x=>x[0]),["begin","quote","reserve","seal","receipt","commit"]);
 assert.equal(result.orderId,orderId);
 assert.equal(result.status,"held_no_payment");
 assert.equal(result.totalCents,4700);
 assert.equal(result.deliverySealed,true);
 assert.equal(result.canPay,false);
 assert.equal(result.canShip,false);
 assert.equal(result.invoiceCreated,false);
 assert.equal(result.paymentConfirmed,false);
 assert.equal(tx.committed.length,2);
 assert.ok(!JSON.stringify(result).includes("Example Street"));
 assert.ok(!JSON.stringify(result).includes("sample@example.invalid"));
 const stored=tx.stagedEnvelope.value;
 assert.ok(Buffer.isBuffer(stored.ciphertext));
 assert.ok(!stored.ciphertext.includes(Buffer.from("Example Street")));
 const recovered=openPrivateOrderDeliveryV1({
  storeId,orderId,keyReference:defaults.deliveryKeyReference,
  key:encryptionKey,
  envelope:{
   order_id:orderId,store_id:storeId,envelope_format:"aes-256-gcm-v1",
   key_reference:defaults.deliveryKeyReference,
   nonce:stored.nonce,ciphertext:stored.ciphertext,auth_tag:stored.authTag,
   delivery_verified:false,shipping_authorized:false,
  },
 });
 assert.equal(recovered.address1,delivery.address1);
 assert.equal(recovered.email,delivery.email);
 const reserve=tx.calls.find(x=>x[0]==="reserve")[1];
 assert.equal(reserve.expectedTotalCents,4700);
 assert.ok(/^[0-9a-f]{64}$/.test(reserve.requestFingerprint));
 assert.equal(reserve.items[0].quantity,1);
 assert.ok(!JSON.stringify(reserve).includes("Example Street"));
 assert.ok(!JSON.stringify(reserve).includes("sample@example.invalid"));
});

test("same-key replay returns the original sealed order without reencrypting delivery",async()=>{
 const tx=makeTx({replay:true,sealedAlready:true});
 const result=await run(tx);
 assert.equal(result.replayed,true);
 assert.deepEqual(tx.calls.map(x=>x[0]),["begin","quote","reserve","receipt","commit"]);
 assert.equal(tx.stagedEnvelope.value,null);
});

test("a replay missing the original envelope is rejected and rolls back",async()=>{
 const tx=makeTx({replay:true,sealedAlready:false});
 await assert.rejects(run(tx),/Private checkout hold unavailable/);
 assert.deepEqual(tx.calls.map(x=>x[0]).slice(-1),["rollback"]);
 assert.equal(tx.committed.length,0);
});

test("delivery failures and incorrect receipt evidence roll back the entire reservation",async()=>{
 for(const failAt of ["reserve","seal","receipt"]){
  const tx=makeTx({failAt});
  await assert.rejects(run(tx));
  assert.equal(tx.committed.length,0);
  assert.equal(tx.calls.at(-1)[0],"rollback");
 }
 const tx=makeTx();
 const wrong={...source,
  items:[{...source.items[0],availability:"sold_out"}]};
 const failTx=makeTx();
 failTx.withTransaction=async work=>{
  return work({
   async quoteSource(){return wrong;},
   async reserve(){throw Error("Should never reserve unavailable stock");},
   async attachDelivery(){throw Error("Never");},
   async receipt(){throw Error("Never");},
  });
 };
 await assert.rejects(run(failTx),/Private checkout hold unavailable/);
});

test("untrusted sessions, missing keys, or more than eight cart lines are not admitted",async()=>{
 const tx=makeTx();
 for(const options of [
  {verifiedSession:{verified:false,subjectId:sessionId}},
  {verifiedSession:{verified:true,subjectId:"client-claimed"}},
  {deliveryKey:Buffer.alloc(16)},
  {deliveryKeyReference:"bad!"},
  {fingerprintKey:"short"},
 ]){
  await assert.rejects(run(tx,options),/Private checkout hold unavailable/);
 }
 const extra=Array.from({length:9},(_,i)=>({
  product_id:"50000000-0000-4000-8000-"+String(i+100).padStart(12,"0"),quantity:1,
 }));
 await assert.rejects(
  preparePrivateRetailHoldWithDeliveryV1({
   ...raw,cart:{...raw.cart,items:extra},
  },{...defaults,withTransaction:tx.withTransaction}),
  /Private checkout hold unavailable/,
 );
 assert.equal(tx.calls.length,0,"All invalid requests must fail before DB calls");
});

test("session identity binds order retry fingerprint even for otherwise identical carts",async()=>{
 const a=makeTx(),b=makeTx();
 await run(a);
 await run(b,{verifiedSession:{
  verified:true,subjectId:"760c57c5-9852-4491-b194-dc7412677757",
 }});
 assert.notEqual(
  a.calls.find(x=>x[0]==="reserve")[1].requestFingerprint,
  b.calls.find(x=>x[0]==="reserve")[1].requestFingerprint,
 );
});

test("no live route, payout, invoice, email or scheduled worker is enabled by this slice",()=>{
 const app=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 const sql=readFileSync(
  "supabase/migrations/20261114031000_apex_retail_order_delivery_atomic_boundary.sql","utf8");
 const js=readFileSync("src/lib/checkout/private-retail-hold-coordinator-v1.mjs","utf8");
 assert.match(app,/CHECKOUT_UNAVAILABLE/);
 assert.match(app,/status:503/);
 assert.match(sql,/deferrable initially deferred/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/retail_order_engine_gate/);
 assert.match(sql,/delivery_verified=false/);
 assert.match(sql,/shipping_authorized=false/);
 assert.match(sql,/revoke all on function apex_internal\.attach_retail_delivery_envelope/);
 assert.doesNotMatch(sql,/grant execute on function apex_internal\.attach_retail_delivery_envelope/);
 assert.doesNotMatch(js,/createInvoice|paymentSettled|markPaid|sendEmail|setInterval|fetch\(/);
});
