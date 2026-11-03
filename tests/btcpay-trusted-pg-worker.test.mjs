import test from "node:test";
import assert from "node:assert/strict";
import {createTrustedRegtestPgWorker} from "../scripts/btcpay-ephemeral-trusted-pg-worker.mjs";

const safeEnv={
 CI:"true",GITHUB_ACTIONS:"true",
 APEX_BTCPAY_EPHEMERAL:"true",APEX_BTCPAY_TEST_NETWORK:"regtest",
 PGHOST:"localhost",PGPORT:"5432",PGDATABASE:"apex_test",
 PGUSER:"postgres",PGPASSWORD:"disposable",
 RUNNER_TEMP:"/home/runner/work/_temp/worker-tests",
};
const storeId="trusted_unit_store",scopeId="39000000-0000-0000-0000-000000000001";
const orderRef="trusted_unit_order",amountSats=10000n;
const intentId="12345678-1234-4123-8123-123456789abc";
const apiKey="fake_key_unused_without_real_provider";
const request={scopeId,storeId,orderRef,amountSats,apiKey};

test("strict runtime refuses non-CI, wrong DB, remote database and non-regtest",()=>{
 const bad=[
  {CI:"false"},{GITHUB_ACTIONS:"false"},
  {APEX_BTCPAY_EPHEMERAL:"false"},{APEX_BTCPAY_TEST_NETWORK:"mainnet"},
  {PGHOST:"db.production.example"},{PGPORT:"6432"},
  {PGDATABASE:"postgres"},{PGUSER:"service_role"},
  {RUNNER_TEMP:"/tmp/unsafe"},{PGPASSWORD:""},
 ];
 for(const change of bad){
  assert.throws(()=>createTrustedRegtestPgWorker({
    env:{...safeEnv,...change},
    runPsql:async()=>{throw Error("SQL should not execute")},
    fetchImpl:async()=>{throw Error("HTTP should not execute")},
  }),/isolated GitHub Postgres regtest fixture/);
 }
});

test("trusted worker owns SQL reserve -> verified DB readback -> HTTP POST/GET -> audit record",async()=>{
 const steps=[];
 const fake=async args=>{
  assert.ok(args.includes("-X")&&args.includes("ON_ERROR_STOP=1"));
  const command=args.at(-1);
  if(command.endsWith("btcpay-worker-reserve.sql")){
   steps.push("reserve");
   assert.ok(args.includes("scope_id="+scopeId));
   assert.ok(args.includes("store_id="+storeId));
   return intentId;
  }
  if(command.endsWith("btcpay-worker-verify.sql")){
   steps.push("verify");
   return JSON.stringify({intentId,storeId,orderRef,
     amountSats:"10000",network:"regtest",status:"reserved_before_post"});
  }
  if(command.endsWith("btcpay-worker-observe.sql")){
   steps.push("observe");
   assert.ok(args.includes("kind=invoice_seen_by_readback"));
   return "recorded_without_checkout_authorization";
  }
  throw Error("Unexpected untrusted SQL file");
 };
 const worker=createTrustedRegtestPgWorker({
  env:safeEnv,runPsql:fake,
  fetchImpl:async(url,opts)=>{
   steps.push(opts.method);
   const u=new URL(url);
   assert.equal(u.hostname,"127.0.0.1");
   assert.equal(opts.headers.Authorization,"token "+apiKey);
   if(opts.method==="POST"){
    const data=JSON.parse(opts.body);
    assert.equal(data.metadata.apexIntentId,intentId);
    assert.equal(data.metadata.orderId,orderRef);
    return {ok:true,json:async()=>({id:"invoice_a",storeId})};
   }
   return {ok:true,json:async()=>({
    id:"invoice_a",storeId,currency:"BTC",amount:"0.00010000",
    metadata:{orderId:orderRef,apexIntentId:intentId},status:"New",
   })};
  },
 });
 const out=await worker.createInvoice(request);
 assert.deepEqual(steps,["reserve","verify","POST","GET","observe"]);
 assert.equal(out.status,"observed_regtest_invoice_no_checkout");
 assert.equal(out.productionReady,false);
 assert.equal(out.fulfillmentAllowed,false);
});

test("missing or stale persisted readback means ZERO provider requests",async()=>{
 let http=0;
 const worker=createTrustedRegtestPgWorker({
  env:safeEnv,
  runPsql:async args=>args.at(-1).endsWith("reserve.sql")?intentId:"{}",
  fetchImpl:async()=>{http++;throw Error("forbidden HTTP")},
 });
 await assert.rejects(worker.createInvoice(request));
 assert.equal(http,0);
});

test("database reservation failure is sanitized, and no provider call runs",async()=>{
 let http=0;
 const worker=createTrustedRegtestPgWorker({
  env:safeEnv,
  runPsql:async()=>{throw Error("PRIVATE DATABASE SECRET");},
  fetchImpl:async()=>{http++;},
 });
 await assert.rejects(worker.createInvoice(request),
  e=>!e.message.includes("PRIVATE DATABASE SECRET"));
 assert.equal(http,0);
});

test("wrong scope, invalid amount, forged store and missing key rejected pre-SQL",async()=>{
 let sql=0;
 const worker=createTrustedRegtestPgWorker({
  env:safeEnv,runPsql:async()=>{sql++;return intentId;},
  fetchImpl:async()=>{throw Error("Unexpected HTTP")},
 });
 for(const change of [
  {scopeId:"wrong"},{storeId:"../other"},{orderRef:"wrong/quote"},
  {amountSats:1n},{apiKey:"short"},
 ]) await assert.rejects(worker.createInvoice({...request,...change}));
 assert.equal(sql,0);
});
