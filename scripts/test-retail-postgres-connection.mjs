/**
 * GitHub Actions disposable PostgreSQL integration test ONLY.
 * Refuses any host/database other than the CI fixture. Tests the real pg
 * driver, NOINHERIT role switch, genuine AES-256-GCM delivery, transaction,
 * duplicate replay and nonpayable receipt without exposing any public route.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {verifyRestrictedRetailConnectionV1}
 from "../src/lib/checkout/retail-restricted-db-probe-v1.mjs";
import {createRetailPostgresTransactionV1}
 from "../src/lib/checkout/retail-postgres-transaction-v1.mjs";
import {verifyPrivateRetailCustomerSessionV1}
 from "../src/lib/checkout/verified-customer-session-v1.mjs";
import {admitPrivateNonpayableRetailOrderV1}
 from "../src/lib/checkout/retail-nonpayable-admission-controller-v1.mjs";
import {createRetailPostgresAdmissionDependenciesV1}
 from "../src/lib/checkout/retail-postgres-admission-dependencies-v1.mjs";
import {preparePrivateRetailHoldWithDeliveryV1}
 from "../src/lib/checkout/private-retail-hold-coordinator-v1.mjs";

if(process.env.PGHOST!=="localhost"||
 process.env.PGDATABASE!=="retail_test"||
 process.env.CI!=="true"||
 process.env.PGUSER!=="apex_retail_checkout_app"||
 typeof process.env.PGPASSWORD!=="string")
 throw new Error("Refusing PostgreSQL checkout integration outside CI fixture");

const STORE="10000000-0000-4000-8000-000000000001";
const PRODUCT="50000000-0000-4000-8000-000000000001";
const REQUEST="ea1f01bf-85b0-4d78-8ed8-af3eb620eae1";
const USER="f1c93598-ed11-470e-aa1a-0c497644a980";
const raw={
 schemaVersion:1,requestId:REQUEST,
 cart:{items:[{product_id:PRODUCT,quantity:1}],code:"",boxSize:"auto"},
 delivery:{firstName:"Synthetic",lastName:"Buyer",
  email:"test-person@example.invalid",phone:"",
  address1:"99 Fictional Lane",address2:"",
  city:"Nowhere",state:"TX",postalCode:"79401"},
};
const pool=new pg.Pool({
 host:"127.0.0.1",port:5432,database:"retail_test",
 user:process.env.PGUSER,password:process.env.PGPASSWORD,
 ssl:false,max:6,idleTimeoutMillis:1000,connectionTimeoutMillis:3500,
});
try{
 // Real restricted-login connection verifies private schema is inaccessible
 // while role membership and transaction-local executor checks still work.
 // CI fixture-only observation of nonsecret permission Booleans. The
 // production verifier still returns no SQL errors and never logs secrets.
 // This wrapper ensures failures are attributable to the first privilege
 // SELECT, transaction-local role change, or executor privilege SELECT.
 const diagnosisPool={
  async connect(){
   const c=await pool.connect();
   return {
    async query(sql){
     const stage=sql.includes("current_database()")?"app_privileges":
       sql.includes("may_execute_restricted_reserve")?"executor_privileges":
       sql==="SET LOCAL ROLE apex_retail_checkout_executor"?"role_switch":
       sql==="BEGIN READ ONLY"?"begin_read_only":"rollback";
     try{
      const answer=await c.query(sql);
      if(stage==="app_privileges"||stage==="executor_privileges")
       process.stdout.write("CI "+stage+" "+JSON.stringify(answer.rows)+"\\n");
      return answer;
     }catch(e){
      process.stderr.write("CI restricted role "+stage+" SQLSTATE "+String(e?.code??"unknown")+"\\n");
      throw e;
     }
    },
    release(){c.release();},
   };
  },
 };
 const permissionCheck=await verifyRestrictedRetailConnectionV1(diagnosisPool,{
  expectedDatabase:"retail_test",
 });
 assert.equal(permissionCheck.connected,true);
 assert.equal(permissionCheck.scopedRoleSwitchVerified,true);
 assert.equal(permissionCheck.privateTableAccessDenied,true);
 assert.equal(permissionCheck.orderWritesPerformed,false);
 const session=await verifyPrivateRetailCustomerSessionV1({
  auth:{getUser:async()=>({data:{user:{
   id:USER,aud:"authenticated",created_at:"2026-11-01T00:00:00Z",
   is_anonymous:false,
  }},error:null})},
 });
 const options={
  trustedStoreId:STORE,
  verifiedSession:session,
  fingerprintKey:"synthetic-test-only-hmac-secret-value".repeat(2),
  deliveryKeyReference:"test_key_1",
  deliveryKey:randomBytes(32),
  withTransaction:createRetailPostgresTransactionV1({pool}),
 };
 const receipt=await preparePrivateRetailHoldWithDeliveryV1(raw,options);
 assert.equal(receipt.status,"held_no_payment");
 assert.equal(receipt.totalCents,4700);
 assert.equal(receipt.canPay,false);
 assert.equal(receipt.canShip,false);
 assert.equal(receipt.invoiceCreated,false);
 assert.equal(receipt.deliverySealed,true);
 assert.equal(receipt.replayed,false);
 const replay=await preparePrivateRetailHoldWithDeliveryV1(raw,options);
 assert.equal(replay.orderId,receipt.orderId);
 assert.equal(replay.replayed,true);
 // The real executor-only durable budget and one-store resolver are now
 // both exercised via separate transactions over the actual NOINHERIT pool.
 // CI-only SQLSTATE instrumentation: never emit SQL values, parameter
 // lists, customer identifiers or private server error messages.
 const guardedPool={
  async connect(){
   const c=await pool.connect();
   return {
    async query(sql,params){
     try{return await c.query(sql,params);}
     catch(e){
      const stage=sql.includes("consume_retail_budget")?"budget":
       sql.includes("resolve_retail_store")?"store":
       sql==="BEGIN"?"begin":sql.startsWith("SET LOCAL")?"set_local":"other";
      process.stderr.write("CI guarded pool "+stage+" SQLSTATE "+
       String(e?.code??"unknown")+"\\n");
      throw e;
     }
    },
    release(){c.release();},
   };
  },
 };
 const guards=createRetailPostgresAdmissionDependenciesV1({pool:guardedPool});
 const allowed=await guards.consumeDurableAdmissionBudget({
  subjectId:USER,operation:"nonpayable_retail_order_v1",
 });
 assert.deepEqual(allowed,{allowed:true,durable:true});
 const scope=await guards.resolveTrustedRetailStore({
  subjectId:USER,items:raw.cart.items,
 });
 assert.deepEqual(scope,{verified:true,storeId:STORE});
 const mixedStore=await guards.resolveTrustedRetailStore({
  subjectId:USER,
  items:[
   {product_id:PRODUCT,quantity:1},
   {product_id:"50000000-0000-4000-8000-000000000004",quantity:1},
  ],
 });
 assert.equal(mixedStore.verified,false);

 // Twenty parallel requests for one distinct subject must yield *exactly*
 // ten accepted attempts over the shared PostgreSQL row, even with 6
 // simultaneous connections and no per-instance in-memory counters.
 const competingSubject="f1c93598-ed11-470e-aa1a-0c497644a981";
 const contention=await Promise.all(Array.from({length:20},()=>
  guards.consumeDurableAdmissionBudget({
   subjectId:competingSubject,operation:"nonpayable_retail_order_v1",
  })));
 assert.equal(contention.filter(x=>x.allowed===true).length,10);
 assert.equal(contention.filter(x=>x.allowed===false).length,10);
 assert.ok(contention.every(x=>x.durable===true));

 // Traverse the new real HTTP-body parser and authenticated admission
 // controller using disposable fixtures only. An identical request must
 // replay the existing durable hold without a second inventory reservation.
 const httpRequest=new Request("https://apexanabolics.co/api/checkout/handoff/v1",{
  method:"POST",
  headers:{"Origin":"https://apexanabolics.co",
   "Content-Type":"application/json","Sec-Fetch-Site":"same-origin"},
  body:JSON.stringify(raw),
 });
 const admitted=await admitPrivateNonpayableRetailOrderV1({
  request:httpRequest,
  authClient:{auth:{getUser:async()=>({data:{user:{
   id:USER,aud:"authenticated",created_at:"2026-11-01T00:00:00Z",
   is_anonymous:false,
  }},error:null})}},
  pool,...guards,
  fingerprintKey:options.fingerprintKey,
  deliveryKeyReference:options.deliveryKeyReference,
  deliveryKey:options.deliveryKey,
 });
 assert.equal(admitted.ok,true);
 assert.equal(admitted.accepted,true);
 assert.equal(admitted.orderId,receipt.orderId);
 assert.equal(admitted.replayed,true);
 assert.equal(admitted.canPay,false);
 assert.equal(admitted.canShip,false);
 assert.equal(admitted.invoiceCreated,false);
 assert.equal(admitted.paymentConfirmed,false);
 assert.ok(!JSON.stringify(admitted).includes("Fictional Lane"));

 assert.equal(replay.totalCents,4700);
 assert.equal(replay.canPay,false);
 assert.ok(!JSON.stringify(receipt).includes("Fictional Lane"));
 assert.ok(!JSON.stringify(replay).includes("test-person@example.invalid"));
 // Verify the NOINHERIT login has no direct access even on an actual
 // PostgreSQL network connection, without mutating private tables.
 const client=await pool.connect();
 try{
  const before=await client.query("select current_user as role");
  assert.equal(before.rows[0].role,"apex_retail_checkout_app");
  const roles=await client.query(
    "select has_table_privilege(current_user,'public.inventory_items','UPDATE') as stock_write"
  );
  assert.equal(roles.rows[0].stock_write,false);
 }finally{client.release();}
 process.stdout.write("Private checkout PostgreSQL+AES transaction, retry and role isolation passed\n");
}finally{
 await pool.end();
}
