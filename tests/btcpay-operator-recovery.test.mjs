import test from "node:test";
import assert from "node:assert/strict";
import {createEphemeralOperatorRecovery} from
 "../scripts/btcpay-ephemeral-operator-recovery.mjs";

const env={
 CI:"true",GITHUB_ACTIONS:"true",
 APEX_BTCPAY_EPHEMERAL:"true",APEX_BTCPAY_TEST_NETWORK:"regtest",
 PGHOST:"localhost",PGPORT:"5432",PGDATABASE:"apex_test",
 RUNNER_TEMP:"/home/runner/work/_temp/recovery",
 APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD:"requester_fake_secret_1",
 APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD:"reviewer_fake_secret_2",
};
const intentId="12345678-1234-4123-8123-123456789abc";
const requestId="87654321-4321-4321-8321-cba987654321";
const digest="d".repeat(64);
const valid={intentId,invoiceId:"verified_synthetic_invoice",
 requesterDigest:digest,reviewerDigest:digest};

test("recovery rejects any non-isolated runner and shared operator credentials",()=>{
 for(const patch of [
  {CI:"false"},{GITHUB_ACTIONS:"false"},
  {APEX_BTCPAY_EPHEMERAL:"false"},{APEX_BTCPAY_TEST_NETWORK:"mainnet"},
  {PGHOST:"production.example"},{PGDATABASE:"postgres"},
  {RUNNER_TEMP:"/tmp"},
  {APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD:""},
  {APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD:"requester_fake_secret_1"},
 ]){
  assert.throws(()=>createEphemeralOperatorRecovery({
    env:{...env,...patch},
    runPsql:async()=>{throw Error("Must not execute SQL")},
  }),/independently authenticated disposable recovery roles required/);
 }
});
test("only distinct operator SQL credentials may request and approve matching evidence",async()=>{
 const roles=[];
 const recovery=createEphemeralOperatorRecovery({
  env,runPsql:async(role,script,args)=>{
   roles.push(role+":"+script);
   assert.ok(args.includes("-X")&&args.includes("ON_ERROR_STOP=1"));
   assert.ok(!args.some(a=>a.includes("fake_secret")));
   if(role==="requester"&&script==="request"){
     assert.ok(args.includes("intent_id="+intentId));
     assert.ok(args.includes("invoice_id=verified_synthetic_invoice"));
     return requestId;
   }
   assert.equal(role,"reviewer");
   assert.equal(script,"approve");
   assert.ok(args.includes("request_id="+requestId));
   assert.ok(args.includes("evidence_sha256="+digest));
   return "reconciled_without_checkout_or_retry";
  },
 });
 const result=await recovery.reconcile(valid);
 assert.deepEqual(roles,["requester:request","reviewer:approve"]);
 assert.equal(result.independentOperatorReview,true);
 assert.equal(result.checkoutReleaseAllowed,false);
 assert.equal(result.providerRetryAllowed,false);
 assert.equal(result.fulfillmentAllowed,false);
});
test("invalid inputs never start a recovery SQL query",async()=>{
 let queries=0;
 const recovery=createEphemeralOperatorRecovery({
  env,runPsql:async()=>{queries++;return requestId;},
 });
 for(const patch of [
  {intentId:"not-a-uuid"},{invoiceId:"../another-store"},
  {requesterDigest:"invalid"},{reviewerDigest:"fake"},
 ])
  await assert.rejects(recovery.reconcile({...valid,...patch}));
 assert.equal(queries,0);
});
test("mismatched reviewer evidence remains pending; no checkout permission is returned",async()=>{
 const recovery=createEphemeralOperatorRecovery({
  env,runPsql:async(role,script)=>{
   if(role==="requester"&&script==="request")return requestId;
   throw Error("Reviewer independently rejected evidence digest");
  },
 });
 await assert.rejects(recovery.reconcile({
  ...valid,reviewerDigest:"a".repeat(64),
 }),/Authenticated operator recovery operation denied/);
});
