import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {readNonpayableCheckoutRequestV1,
 APEX_CHECKOUT_ORIGIN_V1,APEX_CHECKOUT_MAX_BODY_BYTES_V1}
 from "../src/lib/checkout/retail-nonpayable-request-boundary-v1.mjs";
import {admitPrivateNonpayableRetailOrderV1}
 from "../src/lib/checkout/retail-nonpayable-admission-controller-v1.mjs";

const STORE="10000000-0000-4000-8000-000000000001";
const PRODUCT="50000000-0000-4000-8000-000000000001";
const USER="9819cbcc-5e4b-4b33-aa12-8d78af338702";
const ORDER="80000000-0000-4000-8000-000000000080";
const REQUEST="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const delivery={
 firstName:"Sample",lastName:"Customer",email:"test@example.invalid",
 phone:"",address1:"123 Example Street",address2:"",
 city:"Fictiontown",state:"TX",postalCode:"79401",
};
const body={
 schemaVersion:1,requestId:REQUEST,
 cart:{items:[{product_id:PRODUCT,quantity:1}],code:"",boxSize:"auto"},
 delivery,
};
const quote={
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:PRODUCT,quantity:1,name:"Workout Shirt",unit_price_cents:"3200",
  availability:"in_stock",can_checkout:false}],
 shipping:{charge_shipping:true,flat_shipping_cents:1500,
  medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
  envelope_max_items:4},
 promotion:null,requested_code:"",
 can_place_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,
};
function request(payload=body,override={}){
 const headers={Origin:APEX_CHECKOUT_ORIGIN_V1,
  "Content-Type":"application/json","Sec-Fetch-Site":"same-origin",...override.headers};
 return new Request(override.url??APEX_CHECKOUT_ORIGIN_V1+"/api/checkout/handoff/v1",{
  method:"POST",headers,
  body:typeof payload==="string"?payload:JSON.stringify(payload),
 });
}
function fakePg({failAt="",replayed=false}={}){
 const calls=[];
 let released=0,connects=0;
 const client={
  async query(sql,params=[]){
   calls.push({sql,params});
   if(failAt&&sql.includes(failAt))throw new Error("private PII SQL diagnostic");
   let payload=null;
   if(sql.includes("get_public_retail_cart_quote_source"))payload=quote;
   if(sql.includes("checkout_worker_reserve_retail_hold"))payload={
    schema_version:1,order_id:ORDER,status:"held_no_payment",
    replayed,total_cents:"4700",can_pay:false,
    can_ship:false,invoice_created:false,
   };
   if(sql.includes("checkout_worker_attach_retail_delivery"))payload={
    schema_version:1,order_id:ORDER,sealed:true,replayed:false,
    can_pay:false,can_ship:false,
   };
   if(sql.includes("checkout_worker_get_retail_receipt"))payload={
    schema_version:1,order_id:ORDER,store_id:STORE,
    created_at:"2026-11-14T01:00:00.000Z",
    expires_at:"2026-11-14T01:15:00.000Z",
    status:"held_no_payment",currency:"USD",line_count:1,
    unit_count:1,merchandise_cents:"3200",discount_cents:"0",
    shipping_cents:"1500",total_cents:"4700",
    delivery_sealed:true,can_pay:false,can_ship:false,
    invoice_created:false,payment_confirmed:false,
   };
   return {rows:payload?[{payload}]:[]};
  },
  release(){released++;},
 };
 return {pool:{async connect(){connects++;return client;}},calls,
  get released(){return released;},get connects(){return connects;}};
}
function dependencies(overrides={}){
 const seen={limits:[],stores:[]};
 const authClient={auth:{getUser:async()=>({
  data:{user:{id:USER,aud:"authenticated",
   created_at:"2026-11-01T00:00:00Z",is_anonymous:false,
   email_confirmed_at:"2026-11-01T00:00:00Z"}},
  error:null,
 })}};
 const consumeDurableAdmissionBudget=async arg=>{
  seen.limits.push(arg);
  return {allowed:true,durable:true};
 };
 const resolveTrustedRetailStore=async arg=>{
  seen.stores.push(arg);
  return {verified:true,storeId:STORE};
 };
 const db=fakePg(overrides.db??{});
 return {options:{
  authClient,consumeDurableAdmissionBudget,resolveTrustedRetailStore,
  pool:db.pool,fingerprintKey:"ab".repeat(40),
  deliveryKeyReference:"test_key_1",deliveryKey:randomBytes(32),
  ...overrides,
 },seen,db};
}
test("signed-in protected same-origin request creates only an atomic nonpayable held receipt",async()=>{
 const state=dependencies();
 const result=await admitPrivateNonpayableRetailOrderV1({
  ...state.options,request:request(),
 });
 assert.equal(result.ok,true);
 assert.equal(result.accepted,true);
 assert.equal(result.orderId,ORDER);
 assert.equal(result.totalCents,4700);
 assert.equal(result.status,"held_no_payment");
 assert.equal(result.deliverySealed,true);
 assert.equal(result.canPay,false);
 assert.equal(result.canShip,false);
 assert.equal(result.invoiceCreated,false);
 assert.equal(result.paymentConfirmed,false);
 assert.equal(state.seen.limits.length,1);
 assert.equal(state.seen.limits[0].subjectId,USER);
 assert.equal(state.seen.stores.length,1);
 assert.equal(state.seen.stores[0].items[0].product_id,PRODUCT);
 assert.equal(Object.hasOwn(state.seen.stores[0],"storeId"),false);
 assert.equal(state.db.connects,1);
 assert.equal(state.db.released,1);
 const sql=state.db.calls.map(x=>x.sql);
 assert.deepEqual(sql,[
  "BEGIN ISOLATION LEVEL READ COMMITTED",
  "SET LOCAL ROLE apex_retail_checkout_executor",
  "SET LOCAL statement_timeout = '8s'",
  "SET LOCAL lock_timeout = '3s'",
  "SET LOCAL idle_in_transaction_session_timeout = '8s'",
  "select public.get_public_retail_cart_quote_source($1::jsonb,$2::text) as payload",
  "select apex_internal.checkout_worker_reserve_retail_hold($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::text,$7::bigint) as payload",
  "select apex_internal.checkout_worker_attach_retail_delivery($1::uuid,$2::uuid,$3::text,$4::bytea,$5::bytea,$6::bytea) as payload",
  "select apex_internal.checkout_worker_get_retail_receipt($1::uuid,$2::uuid) as payload",
  "COMMIT",
 ]);
 assert.equal(state.db.calls[6].params[0],STORE);
 assert.equal(state.db.calls[6].params.at(-1),4700);
 assert.ok(Buffer.isBuffer(state.db.calls[7].params[3]));
 assert.ok(Buffer.isBuffer(state.db.calls[7].params[4]));
 assert.ok(Buffer.isBuffer(state.db.calls[7].params[5]));
 assert.doesNotMatch(JSON.stringify(result),/Example Street|example.invalid|key|fingerprint|nonce/i);
});
test("identical retry returns canonical held identity without re-encrypting",async()=>{
 const state=dependencies({db:{replayed:true}});
 const receipt=await admitPrivateNonpayableRetailOrderV1({...state.options,request:request()});
 assert.equal(receipt.replayed,true);
 assert.equal(receipt.orderId,ORDER);
 assert.ok(!state.db.calls.some(x=>x.sql.includes("checkout_worker_attach_retail_delivery")));
 assert.equal(state.db.calls.at(-1).sql,"COMMIT");
});
test("unauthenticated identity is denied before limiter, PII and DB operations",async()=>{
 const state=dependencies({authClient:{auth:{getUser:async()=>({data:{user:null},error:null})}}});
 const input=request();
 const r=await admitPrivateNonpayableRetailOrderV1({...state.options,request:input});
 assert.deepEqual(r,{ok:false,code:"CUSTOMER_AUTH_REQUIRED",
  accepted:false,canPay:false,canShip:false,invoiceCreated:false,paymentConfirmed:false});
 assert.equal(input.bodyUsed,false);
 assert.equal(state.seen.limits.length,0);
 assert.equal(state.db.connects,0);
});
test("missing or non-durable rate limiter never reads delivery or creates a hold",async()=>{
 for(const deny of [null,{allowed:true,durable:false},{allowed:false,durable:true}]){
  const state=dependencies({consumeDurableAdmissionBudget:async()=>deny});
  const input=request();
  const r=await admitPrivateNonpayableRetailOrderV1({...state.options,request:input});
  assert.equal(r.ok,false);
  assert.equal(r.code,"ADMISSION_RATE_LIMITED");
  assert.equal(input.bodyUsed,false);
  assert.equal(state.db.connects,0);
 }
 const state=dependencies({consumeDurableAdmissionBudget:null});
 const input=request();
 const r=await admitPrivateNonpayableRetailOrderV1({...state.options,request:input});
 assert.equal(r.code,"NONPAYABLE_ADMISSION_UNAVAILABLE");
 assert.equal(input.bodyUsed,false);
});
test("unverified or forged store scope never reaches PostgreSQL",async()=>{
 for(const store of [
  {verified:false,storeId:STORE},
  {verified:true,storeId:"fake"},
  {verified:true,storeId:null},
  null,
 ]){
  const state=dependencies({resolveTrustedRetailStore:async()=>store});
  const r=await admitPrivateNonpayableRetailOrderV1({...state.options,request:request()});
  assert.equal(r.ok,false);
  assert.equal(r.code,"NONPAYABLE_ADMISSION_UNAVAILABLE");
  assert.equal(state.db.connects,0);
 }
});
test("bad origin, unsafe fetch metadata and incorrect content type reject before SQL",async()=>{
 const attempts=[
  request(body,{headers:{Origin:"https://evil.invalid"}}),
  request(body,{headers:{"Sec-Fetch-Site":"cross-site"}}),
  request(body,{headers:{"Content-Type":"text/plain"}}),
  request(body,{headers:{"Content-Encoding":"gzip"}}),
  request(body,{url:"https://evil.invalid/api/checkout/handoff/v1"}),
  request(body,{url:APEX_CHECKOUT_ORIGIN_V1+"/api/checkout/handoff/v1?debug=true"}),
  request(body,{url:APEX_CHECKOUT_ORIGIN_V1+"/api/checkout/handoff/v1evil"}),
 ];
 for(const input of attempts){
  const state=dependencies();
  const result=await admitPrivateNonpayableRetailOrderV1({...state.options,request:input});
  assert.equal(result.ok,false);
  assert.equal(result.code,"INVALID_CHECKOUT_REQUEST");
  assert.equal(state.db.connects,0);
 }
});
test("reject oversized input, malformed JSON and price/identity spoofing",async()=>{
 for(const payload of [
  "x".repeat(APEX_CHECKOUT_MAX_BODY_BYTES_V1+1),
  "{invalid",
  {...body,storeId:STORE},
  {...body,priceCents:1},
  {...body,requestId:"not-a-uuid"},
  {...body,delivery:{...delivery,paymentAddress:"attacker"}},
 ]){
  const state=dependencies();
  const result=await admitPrivateNonpayableRetailOrderV1({
   ...state.options,request:request(payload),
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,"INVALID_CHECKOUT_REQUEST");
  assert.equal(state.db.connects,0);
 }
});
test("SQL failure rolls back and never exposes private error or delivery",async()=>{
 const state=dependencies({db:{failAt:"checkout_worker_attach_retail_delivery"}});
 const r=await admitPrivateNonpayableRetailOrderV1({...state.options,request:request()});
 assert.equal(r.ok,false);
 assert.equal(r.code,"NONPAYABLE_ADMISSION_UNAVAILABLE");
 assert.equal(state.db.calls.at(-1).sql,"ROLLBACK");
 assert.equal(state.db.released,1);
 assert.doesNotMatch(JSON.stringify(r),/private PII|Example Street|example.invalid/i);
});
test("production endpoint stays hard-disabled before any delivery body can be read",()=>{
 const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(route,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(route,/status:503/);
 assert.match(route,/export async function POST\(\)/);
 assert.doesNotMatch(route,/admitPrivateNonpayableRetailOrderV1|request\.json\(|request\.text\(/);
});
