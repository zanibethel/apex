#!/usr/bin/env node
/**
 * Actual PostgreSQL + simulated Greenfield HTTP, on GitHub disposable runner.
 * No real BTCPay API requests or secrets; proves trusted worker chronology.
 */
import assert from "node:assert/strict";
import {createTrustedRegtestPgWorker} from "./btcpay-ephemeral-trusted-pg-worker.mjs";
const key="disposable_fake_key_do_not_use";
const okStore="trusted-synthetic-store-ok";
const unknownStore="trusted-synthetic-store-timeout";
const okScope="39000000-0000-0000-0000-000000000001";
const unknownScope="39000000-0000-0000-0000-000000000002";
let calls=[];
let capturedIntent="";
const worker=createTrustedRegtestPgWorker({
 fetchImpl:async(url,options)=>{
  const u=new URL(url);
  assert.equal(u.origin,"http://127.0.0.1:14142");
  assert.equal(options.headers.Authorization,"token "+key);
  assert.equal(options.redirect,"error");
  calls.push(options.method);
  if(options.method==="POST"){
    assert.equal(u.pathname,"/api/v1/stores/"+okStore+"/invoices");
    const body=JSON.parse(options.body);
    assert.equal(body.currency,"BTC");
    assert.equal(body.amount,"0.00010000");
    assert.equal(body.metadata.orderId,"worker-ok-order-1");
    assert.match(body.metadata.apexIntentId,/^[0-9a-f-]{36}$/i);
    capturedIntent=body.metadata.apexIntentId;
    return {ok:true,json:async()=>({id:"synthetic_worker_invoice_1",storeId:okStore})};
  }
  assert.equal(options.method,"GET");
  assert.equal(u.pathname,
    "/api/v1/stores/"+okStore+"/invoices/synthetic_worker_invoice_1");
  return {ok:true,json:async()=>({
   id:"synthetic_worker_invoice_1",storeId:okStore,
   currency:"BTC",amount:"0.00010000",
   status:"New",
   metadata:{orderId:"worker-ok-order-1",apexIntentId:capturedIntent},
  })};
 },
});

const good=await worker.createInvoice({
 scopeId:okScope,storeId:okStore,
 orderRef:"worker-ok-order-1",amountSats:10000n,apiKey:key,
});
assert.equal(good.status,"observed_regtest_invoice_no_checkout");
assert.equal(good.providerPostAttempts,1);
assert.equal(good.fulfillmentAllowed,false);
assert.deepEqual(calls,["POST","GET"]);
let denied=false;
try{
 await worker.createInvoice({
  scopeId:okScope,storeId:okStore,
  orderRef:"worker-ok-order-1",amountSats:10000n,apiKey:key,
 });
}catch{denied=true;}
assert.equal(denied,true,"Second call must be denied by consumed durable permit");
assert.deepEqual(calls,["POST","GET"],"Duplicate request must never reach provider");

let timeoutCalls=0;
const timeoutWorker=createTrustedRegtestPgWorker({
 fetchImpl:async()=>{
   timeoutCalls++;
   throw Error("simulated unavailable upstream / never log real secret");
 },
});
const uncertain=await timeoutWorker.createInvoice({
 scopeId:unknownScope,storeId:unknownStore,
 orderRef:"worker-timeout-order-1",amountSats:10000n,apiKey:key,
});
assert.equal(uncertain.status,"operator_reconciliation_required");
assert.equal(uncertain.invoiceId,null);
assert.equal(uncertain.automaticallyRetry,false);
assert.equal(timeoutCalls,1);
denied=false;
try{
 await timeoutWorker.createInvoice({
  scopeId:unknownScope,storeId:unknownStore,
  orderRef:"worker-timeout-order-1",amountSats:10000n,apiKey:key,
 });
}catch{denied=true;}
assert.equal(denied,true,"Timeout must permanently consume authorization");
assert.equal(timeoutCalls,1,"No retry after uncertain response");

process.stdout.write(JSON.stringify({
 result:"pass",stores:2,
 postCalls:2,
 realProviderNetworkCalls:0,
 duplicatePostPrevented:true,unknownOutcomeRequiresOperator:true,
 checkoutReleaseAllowed:false,productionReady:false,
})+"\n");
