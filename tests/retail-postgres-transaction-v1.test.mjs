import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {createRetailPostgresTransactionV1}
 from "../src/lib/checkout/retail-postgres-transaction-v1.mjs";
import {preparePrivateRetailHoldWithDeliveryV1}
 from "../src/lib/checkout/private-retail-hold-coordinator-v1.mjs";
import {verifyPrivateRetailCustomerSessionV1}
 from "../src/lib/checkout/verified-customer-session-v1.mjs";

const STORE="10000000-0000-4000-8000-000000000001";
const ORDER="80000000-0000-4000-8000-000000000080";
const PROD="50000000-0000-4000-8000-000000000001";
const REQUEST="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const USER="9819cbcc-5e4b-4b33-aa12-8d78af338702";
const delivery={
 firstName:"Sample",lastName:"Customer",email:"test@example.invalid",
 phone:"",address1:"123 Example Street",address2:"",
 city:"Fictiontown",state:"TX",postalCode:"79401",
};
const source={
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:PROD,quantity:1,name:"Workout Shirt",unit_price_cents:"3200",
   availability:"in_stock",can_checkout:false}],
 shipping:{charge_shipping:true,flat_shipping_cents:1500,
  medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
  envelope_max_items:4},
 promotion:null,requested_code:"",
 can_place_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,
};
const request={
 schemaVersion:1,requestId:REQUEST,
 cart:{items:[{product_id:PROD,quantity:1}],code:"",boxSize:"auto"},
 delivery,
};
function stubPool({failOperation="",invalidReceipt=false}={}){
 const calls=[],connections=[],released=[];
 const timestamp="2026-11-14T01:00:00.000Z";
 const client={
  async query(sql,params=[]){
   calls.push({sql,params,client});
   if(failOperation&&sql.includes(failOperation))throw Error("SQL internal detail cannot be returned");
   let payload=null;
   if(sql.includes("get_public_retail_cart_quote_source"))payload=source;
   if(sql.includes("checkout_worker_reserve_retail_hold"))payload={
    schema_version:1,order_id:ORDER,status:"held_no_payment",
    replayed:false,total_cents:"4700",can_pay:false,
    can_ship:false,invoice_created:false,
   };
   if(sql.includes("checkout_worker_attach_retail_delivery"))payload={
    schema_version:1,order_id:ORDER,sealed:true,replayed:false,
    can_pay:false,can_ship:false,
   };
   if(sql.includes("checkout_worker_get_retail_receipt"))payload={
    schema_version:1,order_id:ORDER,store_id:STORE,
    created_at:timestamp,expires_at:"2026-11-14T01:15:00.000Z",
    status:"held_no_payment",currency:"USD",
    line_count:1,unit_count:1,merchandise_cents:"3200",
    discount_cents:"0",shipping_cents:"1500",total_cents:"4700",
    delivery_sealed:!invalidReceipt,can_pay:false,can_ship:false,
    invoice_created:false,payment_confirmed:false,
   };
   return {rows:payload?[{payload}]:[]};
  },
  release(){released.push(client);},
 };
 return {
  pool:{async connect(){connections.push(client);return client;}},
  calls,connections,released,
 };
}
const opts={
 trustedStoreId:STORE,
 fingerprintKey:"synthetic-fingerprint-key-no-real-identifiers-000000",
 verifiedSession:{verified:true,subjectId:USER},
 deliveryKeyReference:"test_key_1",deliveryKey:randomBytes(32),
};
test("four DB steps share exactly one connection and one explicit transaction",async()=>{
 const env=stubPool(),withTransaction=createRetailPostgresTransactionV1({pool:env.pool});
 const receipt=await preparePrivateRetailHoldWithDeliveryV1(request,{...opts,withTransaction});
 assert.equal(receipt.orderId,ORDER);
 assert.equal(receipt.totalCents,4700);
 assert.equal(receipt.canPay,false);
 assert.equal(receipt.canShip,false);
 assert.equal(env.connections.length,1);
 assert.equal(env.released.length,1);
 const sql=env.calls.map(x=>x.sql);
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
 assert.ok(env.calls.every(c=>c.client===env.connections[0]));
 assert.equal(env.calls[6].params.at(-1),4700);
 assert.ok(Buffer.isBuffer(env.calls[7].params[3]));
 assert.ok(Buffer.isBuffer(env.calls[7].params[4]));
 assert.ok(Buffer.isBuffer(env.calls[7].params[5]));
 assert.ok(!env.calls.some(c=>c.sql.includes(delivery.address1)||c.sql.includes(USER)));
 assert.ok(!JSON.stringify(receipt).includes("test@example.invalid"));
 assert.ok(!JSON.stringify(receipt).includes("123 Example Street"));
});
test("failed database step rolls back on same connection, releases, never commits",async()=>{
 for(const failOperation of ["checkout_worker_reserve_retail_hold",
  "checkout_worker_attach_retail_delivery","checkout_worker_get_retail_receipt"]){
  const env=stubPool({failOperation});
  const runner=createRetailPostgresTransactionV1({pool:env.pool});
  await assert.rejects(
   preparePrivateRetailHoldWithDeliveryV1(request,{...opts,withTransaction:runner}),
   /Retail transaction unavailable/);
  assert.equal(env.calls.at(-1).sql,"ROLLBACK");
  assert.ok(!env.calls.some(c=>c.sql==="COMMIT"));
  assert.equal(env.connections.length,1);
  assert.equal(env.released.length,1);
 }
});
test("receipt fail-closed also causes a full database rollback",async()=>{
 const env=stubPool({invalidReceipt:true});
 await assert.rejects(
  preparePrivateRetailHoldWithDeliveryV1(request,{...opts,
   withTransaction:createRetailPostgresTransactionV1({pool:env.pool})}),
  /Retail transaction unavailable/);
 assert.equal(env.calls.at(-1).sql,"ROLLBACK");
});
test("invalid pool and arbitrary SQL result shape are denied",async()=>{
 assert.throws(()=>createRetailPostgresTransactionV1({}),/Retail transaction unavailable/);
 const env=stubPool();
 env.pool.connect=async()=>({
  async query(sql){
   env.calls.push({sql});
   if(sql.includes("get_public_retail_cart_quote_source"))return {rows:[]};
   return {rows:[]};
  },
  release(){env.released.push(true);},
 });
 await assert.rejects(
  preparePrivateRetailHoldWithDeliveryV1(request,{...opts,
   withTransaction:createRetailPostgresTransactionV1({pool:env.pool})}),
  /Retail transaction unavailable/);
 assert.equal(env.calls.at(-1).sql,"ROLLBACK");
});
test("Supabase getUser is network-verified and user_metadata is never an authority",async()=>{
 const session=await verifyPrivateRetailCustomerSessionV1({
  auth:{getUser:async()=>({data:{user:{
   id:USER,aud:"authenticated",created_at:"2026-11-01T00:00:00Z",
   email_confirmed_at:"2026-11-01T00:00:00Z",
   user_metadata:{apex_role:"platform_admin",subjectId:"attacker"},
  }},error:null})},
 });
 assert.deepEqual(session,{verified:true,subjectId:USER});
 for(const result of [
  {data:{user:null},error:null},
  {data:{user:{id:USER,aud:"authenticated",
    created_at:"2026-11-01T00:00:00Z",is_anonymous:true}},error:null},
  {data:{user:{id:USER,aud:"anonymous",
    created_at:"2026-11-01T00:00:00Z"}},error:null},
  {data:{user:{id:"fake",aud:"authenticated",
    created_at:"2026-11-01T00:00:00Z"}},error:null},
  {data:{user:{id:USER,aud:"authenticated",
    created_at:"2026-11-01T00:00:00Z"}},error:{code:401}},
 ]){
  await assert.rejects(verifyPrivateRetailCustomerSessionV1({
   auth:{getUser:async()=>result},
  }),/Customer session unavailable/);
 }
 await assert.rejects(verifyPrivateRetailCustomerSessionV1({
  auth:{getUser:async()=>{throw Error("token leaked");}},
 }),/Customer session unavailable/);
});
test("public checkout stays disabled and this adapter cannot create a payment",()=>{
 const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 const src=readFileSync("src/lib/checkout/retail-postgres-transaction-v1.mjs","utf8");
 assert.match(route,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(route,/status:503/);
 assert.doesNotMatch(src,/createInvoice|BTCpay|sendEmail|authorizeShipment|\.request\(/);
 assert.doesNotMatch(src,/service_role|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
});
