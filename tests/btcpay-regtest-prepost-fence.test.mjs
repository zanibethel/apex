import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createPreauthorizedRegtestInvoice} from "../src/lib/payments/btcpay-regtest-prepost-fence.mjs";

const id="11111111-2222-4333-8444-555555555555";
const args={
  testOnly:true,network:"regtest",serverUrl:"http://127.0.0.1:14142/",
  storeId:"sandbox_store_1",apiKey:"synthetic_test_token_no_real_access",
  orderRef:"regtest-order-125",amountSats:10000n,
};
const admission={
  intentId:id,storeId:args.storeId,orderRef:args.orderRef,
  amountSats:args.amountSats,network:"regtest",
  status:"reserved_before_post",
};
function providerResponse(url,opt){
  const u=new URL(url);
  assert.equal(u.origin,"http://127.0.0.1:14142");
  assert.equal(opt.redirect,"error");
  assert.equal(opt.cache,"no-store");
  assert.ok(opt.signal);
  assert.equal(opt.headers.Authorization,"token "+args.apiKey);
  if(opt.method==="POST"){
    assert.equal(u.pathname,"/api/v1/stores/sandbox_store_1/invoices");
    const body=JSON.parse(opt.body);
    assert.deepEqual(body,{
      amount:"0.00010000",currency:"BTC",
      metadata:{orderId:args.orderRef,apexIntentId:id},
    });
    return {ok:true,json:async()=>({id:"invoice_125",storeId:args.storeId})};
  }
  assert.equal(opt.method,"GET");
  assert.equal(u.pathname,"/api/v1/stores/sandbox_store_1/invoices/invoice_125");
  return {ok:true,json:async()=>({
    id:"invoice_125",storeId:args.storeId,currency:"BTC",
    amount:"0.00010000",
    metadata:{orderId:args.orderRef,apexIntentId:id},status:"New",
  })};
}

test("durable reservation precedes exactly one POST, GET confirms identity",async()=>{
 const steps=[];
 const out=await createPreauthorizedRegtestInvoice({
   ...args,reserveDurably:async()=>{steps.push("reserve");return admission;},
   recordObservation:async x=>{
     steps.push("observe");
     assert.deepEqual(x,{
       intentId:id,kind:"invoice_seen_by_readback",
       invoiceId:"invoice_125",network:"regtest",
     });
     return "recorded_without_checkout_authorization";
   },
   fetchImpl:async(u,o)=>{steps.push(o.method);return providerResponse(u,o);},
 });
 assert.deepEqual(steps,["reserve","POST","GET","observe"]);
 assert.equal(out.status,"observed_regtest_invoice_no_checkout");
 assert.equal(out.invoiceId,"invoice_125");
 assert.equal(out.providerPostAttempts,1);
 assert.equal(out.automaticallyRetry,false);
 assert.equal(out.fulfillmentAllowed,false);
 assert.equal(out.checkoutReleaseAllowed,false);
 assert.equal(out.splitActivationAllowed,false);
 assert.equal(out.productionReady,false);
});

test("missing, forged, stale or failed reservation prevents any HTTP",async()=>{
 let http=0;
 for(const reserveDurably of [
   async()=>{throw Error("secret database fault");},
   async()=>({...admission,status:"not_committed"}),
   async()=>({...admission,storeId:"other_store"}),
   async()=>({...admission,orderRef:"other_order"}),
   async()=>({...admission,amountSats:10001n}),
   async()=>({...admission,intentId:"bad-intent"}),
 ]) {
  await assert.rejects(createPreauthorizedRegtestInvoice({
   ...args,reserveDurably,recordObservation:async()=>{},
   fetchImpl:async()=>{http++;throw Error("must not send");},
  }),e=>!e.message.includes("secret"));
 }
 assert.equal(http,0);
});

test("mainnet, disabled test mode or remote origin never calls reservation or HTTP",async()=>{
 let called=0;
 for(const changes of [
  {testOnly:false},{network:"mainnet"},{network:"testnet"},
  {serverUrl:"https://btcpay.example.org/"},
  {serverUrl:"http://localhost:14142/"},
  {serverUrl:"http://10.0.0.1:14142/"},
  {serverUrl:"http://user:secret@127.0.0.1:14142/"},
  {serverUrl:"http://127.0.0.1:14142/path"},
  {storeId:"../../cross-store"},{orderRef:"../../order"},
  {amountSats:-1n},
 ]) await assert.rejects(createPreauthorizedRegtestInvoice({
  ...args,...changes,
  reserveDurably:async()=>{called++;return admission;},
  recordObservation:async()=>{},
  fetchImpl:async()=>{called++;},
 }));
 assert.equal(called,0);
});

test("HTTP failure and transport timeout are unknown: no resend and no invoice ID",async()=>{
 for(const fetchImpl of [
  async()=>{throw Error("secret upstream timeout");},
  async()=>({ok:false,status:503,text:async()=>"secret body"}),
  async()=>({ok:true,json:async()=>({id:"unexpected",storeId:"wrong_store"})}),
 ]) {
  const sent=[],recorded=[];
  const r=await createPreauthorizedRegtestInvoice({
   ...args,reserveDurably:async()=>admission,
   recordObservation:async ev=>{recorded.push(ev);return "recorded_without_checkout_authorization";},
   fetchImpl:async(u,o)=>{sent.push(o.method);return fetchImpl(u,o);},
  });
  assert.deepEqual(sent,["POST"]);
  assert.equal(recorded[0].kind,"post_outcome_unknown");
  assert.equal(recorded[0].invoiceId,null);
  assert.equal(r.status,"operator_reconciliation_required");
  assert.equal(r.invoiceId,null);
  assert.equal(r.automaticallyRetry,false);
 }
});

test("provider GET readback mismatch never claims a known successful checkout",async()=>{
 const cases=[
  {metadata:{orderId:"someone_else",apexIntentId:id}},
  {metadata:{orderId:args.orderRef,apexIntentId:"wrong-intent"}},
  {currency:"USD"},{amount:"0.00010001"},{status:"Bogus"},
 ];
 for(const change of cases){
  const sent=[];
  const out=await createPreauthorizedRegtestInvoice({
   ...args,reserveDurably:async()=>admission,
   recordObservation:async x=>{
    assert.equal(x.kind,"post_outcome_unknown");
    return "recorded_without_checkout_authorization";
   },
   fetchImpl:async(url,opt)=>{
    sent.push(opt.method);
    if(opt.method==="POST")return providerResponse(url,opt);
    const x=await providerResponse(url,opt);
    return {ok:true,json:async()=>({...await x.json(),...change})};
   },
  });
  assert.deepEqual(sent,["POST","GET"]);
  assert.equal(out.status,"operator_reconciliation_required");
  assert.equal(out.invoiceId,null);
 }
});

test("failure to durably persist observation requires operator, never repost",async()=>{
 let posts=0;
 const result=await createPreauthorizedRegtestInvoice({
  ...args,reserveDurably:async()=>admission,
  recordObservation:async()=>{throw Error("secret SQL write failed");},
  fetchImpl:async(u,o)=>{
   if(o.method==="POST")posts++;
   return providerResponse(u,o);
  },
 });
 assert.equal(posts,1);
 assert.equal(result.status,"operator_reconciliation_required");
 assert.equal(result.invoiceId,null);
 assert.equal(result.automaticallyRetry,false);
});

test("test-only protocol is not imported by live app routes or production checkout",()=>{
 const source=readFileSync("src/lib/payments/btcpay-regtest-prepost-fence.mjs","utf8");
 assert.match(source,/reserved_before_post/);
 assert.match(source,/providerPostAttempts:1/);
 for(const file of ["src/app/page.tsx","src/app/catalog/page.tsx",
   "src/app/supplier/operations/actions.ts"]){
  assert.doesNotMatch(readFileSync(file,"utf8"),/btcpay-regtest-prepost-fence/);
 }
});


test("real Greenfield-style numeric BTC decimal is compared as exact satoshis",async()=>{
 for(const amount of [0.0001,"0.00010000","0.0001"]){
   const result=await createPreauthorizedRegtestInvoice({
     ...args,reserveDurably:async()=>admission,
     recordObservation:async()=> "recorded_without_checkout_authorization",
     fetchImpl:async(url,opt)=>{
       if(opt.method==="POST")return providerResponse(url,opt);
       const original=await providerResponse(url,opt);
       return {ok:true,json:async()=>({...await original.json(),amount})};
     },
   });
   assert.equal(result.status,"observed_regtest_invoice_no_checkout");
 }
 for(const amount of [0.00010001,"0.00010001","1e-4","0.000100000","0.0001x",null]){
   const result=await createPreauthorizedRegtestInvoice({
     ...args,reserveDurably:async()=>admission,
     recordObservation:async evidence=>{
       assert.equal(evidence.kind,"post_outcome_unknown");
       return "recorded_without_checkout_authorization";
     },
     fetchImpl:async(url,opt)=>{
       if(opt.method==="POST")return providerResponse(url,opt);
       const original=await providerResponse(url,opt);
       return {ok:true,json:async()=>({...await original.json(),amount})};
     },
   });
   assert.equal(result.status,"operator_reconciliation_required");
   assert.equal(result.invoiceId,null);
   assert.equal(result.automaticallyRetry,false);
 }
});
