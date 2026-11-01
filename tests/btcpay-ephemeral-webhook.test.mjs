import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createEphemeralWebhookJournal,btcSats} from "../scripts/btcpay-ephemeral-webhook.mjs";

const secret="not_a_real_disposable_webhook_secret_01234567";
const storeId="syntheticStore11", invoiceId="syntheticInvoice13";
const orderId="APEX-REGTEST-001";
function fixture({readInvoice}={}){
  let reads=0;
  const invoice={id:invoiceId,storeId,metadata:{orderId},
    amount:"0.00010000",currency:"BTC",
    status:"Settled",additionalStatus:"None"};
  const journal=createEphemeralWebhookJournal({
    testOnly:true,network:"regtest",storeId,secret,orderId,
    amountSats:10000n,
    readInvoice:readInvoice||(async()=>{reads++;return invoice;}),
  });
  journal.setInvoiceId(invoiceId);
  function payload(data={}){
    const raw=Buffer.from(JSON.stringify({
      type:"InvoiceSettled",storeId,invoiceId,deliveryId:"syntheticDelivery22",...data,
    }));
    return {raw,signature:"sha256="+createHmac("sha256",secret)
      .update(raw).digest("hex")};
  }
  return {journal,payload,get reads(){return reads;},invoice};
}
test("accepts only exact decimal Bitcoin sats, without float rounding",()=>{
 assert.equal(btcSats("0.00010000"),10000n);
 assert.equal(btcSats(0.0001),10000n);
 assert.equal(btcSats("1.23456789"),123456789n);
 for(const n of ["0.000100001","0.1e-3","1.123456789",
    "Infinity","-1","01.1"])assert.equal(btcSats(n),null);
});
test("webhook only accepts explicit test chain, signed store and trusted order",async()=>{
  assert.throws(()=>createEphemeralWebhookJournal({
    testOnly:true,network:"mainnet",storeId,secret,orderId,
    amountSats:10000n,readInvoice:async()=>{},
  }));
  const f=fixture(),body=f.payload();
  await assert.rejects(f.journal.process(body.raw,"sha256="+"f".repeat(64)),
    /signature/);
  await assert.rejects(f.journal.process(f.payload({storeId:"otherStore"}).raw,
    f.payload({storeId:"otherStore"}).signature),/store/);
  assert.equal(f.journal.observationCount,0);
  const result=await f.journal.process(body.raw,body.signature);
  assert.equal(result.kind,"accepted");
  assert.equal(f.reads,1);
  const repeated=await f.journal.process(body.raw,body.signature);
  assert.equal(repeated.kind,"duplicate");
  assert.equal(f.journal.observationCount,1);
  assert.equal(f.reads,1,"identical delivery never triggers second status mutation");
  const conflicting=f.payload({type:"InvoiceProcessing"});
  await assert.rejects(f.journal.process(conflicting.raw,conflicting.signature),
    /Conflicting webhook/);
});
test("provider status cannot be changed by signed webhook alone",async()=>{
  const f=fixture({readInvoice:async()=>({
    id:invoiceId,storeId,metadata:{orderId},amount:"0.0001",currency:"BTC",
    status:"Processing",additionalStatus:"None",
  })});
  const body=f.payload();
  await assert.rejects(f.journal.process(body.raw,body.signature),
    /not confirmed/);
  assert.equal(f.journal.observationCount,0);
});
test("rejects wrong amount, order, store or provider exceptions",async()=>{
 for(const change of [
   {amount:"0.0002"},{metadata:{orderId:"different"}},
   {storeId:"wrongStore"},{additionalStatus:"PaidOver"},
   {status:"Invalid"},
 ]){
   const f=fixture({readInvoice:async()=>({
     id:invoiceId,storeId,metadata:{orderId},amount:"0.0001",
     currency:"BTC",status:"Settled",additionalStatus:"None",...change,
   })});
   const b=f.payload();
   await assert.rejects(f.journal.process(b.raw,b.signature));
   assert.equal(f.journal.observationCount,0);
 }
});
test("real loopback handler rejects altered signature and duplicate events",async()=>{
 const f=fixture();
 const server=await f.journal.begin();
 try {
   assert.ok(server.url.startsWith("http://127.0.0.1:"));
   const b=f.payload();
   async function send(raw,signature){
     const response=await fetch(server.url,{
       method:"POST",headers:{"BTCPay-Sig":signature},body:raw,
     });
     return response.status;
   }
   assert.equal(await send(b.raw,b.signature),200);
   assert.equal(server.isSettled,true);
   assert.equal(server.deliveryCount,1);
   const checks=await server.replayAssertions();
   assert.deepEqual(checks,{duplicateIgnored:true,tamperingRejected:true,
     crossStoreRejected:true});
   assert.equal(server.deliveryCount,1);
 }finally {await server.close();}
});
