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
 ssl:false,max:1,idleTimeoutMillis:1000,connectionTimeoutMillis:3500,
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
 const permissionCheck=await verifyRestrictedRetailConnectionV1(diagnosisPool);
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
