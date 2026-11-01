/**
 * Disposable loopback-only webhook receiver for a GitHub-hosted BTCPay regtest run.
 * Verifies raw HMAC, store/invoice/order/amount and Greenfield-reported status.
 * Stores only memory-resident test receipts; NO Supabase writes or order credits.
 */
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { parseVerifiedInvoiceEvent } from "../src/lib/payments/btcpay-sandbox.mjs";

const safeId=/^[A-Za-z0-9_-]{1,100}$/;
const acceptedTypes=new Set(["InvoiceSettled","InvoiceProcessing","InvoiceReceivedPayment"]);

export function btcSats(value){
  const match=/^(0|[1-9]\d{0,7})(?:\.(\d{1,8}))?$/.exec(String(value));
  if(!match)return null;
  return BigInt(match[1])*100000000n+
    BigInt((match[2]||"").padEnd(8,"0"));
}

export function createEphemeralWebhookJournal({
 testOnly,network,storeId,secret,orderId,amountSats,readInvoice,
}){
 if(testOnly!==true||network!=="regtest"||typeof storeId!=="string"||
    !safeId.test(storeId)||typeof secret!=="string"||secret.length<16||
    typeof orderId!=="string"||!safeId.test(orderId)||
    typeof amountSats!=="bigint"||amountSats<1000n||
    typeof readInvoice!=="function"){
   throw Error("Webhook receiver requires explicit synthetic regtest order context");
 }
 let expectedInvoiceId;
 const receipts=new Map();
 const latest={raw:null,signature:null};
 let settled=false,observations=0,requestsReceived=0,requestsRejected=0;
 function setInvoiceId(id){
   if(expectedInvoiceId!==undefined || typeof id!=="string"||!safeId.test(id))
     throw Error("Synthetic invoice reference must be set exactly once");
   expectedInvoiceId=id;
 }
 async function process(raw,signature){
   const event=parseVerifiedInvoiceEvent(raw,signature,secret,storeId);
   if(!acceptedTypes.has(event.type))throw Error("Unexpected synthetic webhook event");
   const hash=createHash("sha256").update(raw).digest("hex");
   const already=receipts.get(event.deliveryId);
   if(already){
     if(already.hash!==hash || already.invoiceId!==event.invoiceId ||
        already.eventType!==event.type)
       throw Error("Conflicting webhook delivery replay");
     return {kind:"duplicate",status:200};
   }
   if(expectedInvoiceId===undefined || event.invoiceId!==expectedInvoiceId)
     throw Error("Webhook invoice does not match synthetic order");
   // Even a valid signature does NOT authorize a status transition.
   const invoice=await readInvoice(event.invoiceId);
   if(!invoice || invoice.id!==expectedInvoiceId ||
      invoice.storeId!==storeId || invoice.metadata?.orderId!==orderId ||
      invoice.currency!=="BTC"||btcSats(invoice.amount)!==amountSats)
     throw Error("Greenfield invoice is not the authoritative test order");
   if(invoice.status==="Invalid"||invoice.status==="Expired"||
      !["New","Processing","Settled"].includes(invoice.status)||
      invoice.additionalStatus!=="None")
     throw Error("BTCPay invoice status requires manual review");
   if(event.type==="InvoiceSettled" && invoice.status!=="Settled")
     throw Error("Webhook settlement event is not confirmed by Greenfield");
   // Mark as observed only after independent authenticated re-fetch.
   receipts.set(event.deliveryId,{
     hash,invoiceId:event.invoiceId,eventType:event.type,
   });
   observations++;
   latest.raw=Buffer.from(raw);
   latest.signature=signature;
   if(event.type==="InvoiceSettled"&&invoice.status==="Settled")settled=true;
   return {kind:"accepted",status:200};
 }
 async function begin(port=0){
   if(port!==0&&port!==48173)throw Error("Invalid synthetic webhook port");
   const server=createServer(async(req,res)=>{
     if(req.url!=="/hooks/apex-regtest"||req.method!=="POST"){
       res.writeHead(404).end();return;
     }
     requestsReceived++;
     const sig=req.headers["btcpay-sig"];
     const parts=[];let bytes=0;
     try{
       for await (const b of req){
         bytes+=b.length;
         if(bytes>65536)throw Error("Webhook too large");
         parts.push(b);
       }
       const raw=Buffer.concat(parts);
       const result=await process(raw,typeof sig==="string"?sig:"");
       res.writeHead(result.status).end();
     }catch{
       requestsRejected++;
       // Never expose credential, payload, or provider details in response.
       res.writeHead(400).end();
     }
   });
   await new Promise((resolve,reject)=>{
     server.once("error",reject);
     server.listen(port,"127.0.0.1",resolve);
   });
   const address=server.address();
   if(!address || typeof address==="string" ||
      address.address!=="127.0.0.1") {
     server.close();
     throw Error("Webhook receiver was not bound to loopback");
   }
   const url="http://127.0.0.1:"+address.port+"/hooks/apex-regtest";
   async function call(raw,signature) {
     const response=await fetch(url,{
       method:"POST",headers:{"BTCPay-Sig":signature,
         "Content-Type":"application/json"},
       body:raw,redirect:"error",signal:AbortSignal.timeout(5000),
     });
     return response.status;
   }
   return Object.freeze({
     url,setInvoiceId,
     get isSettled(){return settled;},
     get observationCount(){return observations;},
     get deliveryCount(){return receipts.size;},
     get receivedRequests(){return requestsReceived;},
     get rejectedRequests(){return requestsRejected;},
     async replayAssertions(){
       if(!settled || !latest.raw || !latest.signature)
         throw Error("No authenticated settled webhook to replay");
       const before=receipts.size;
       if(await call(latest.raw,latest.signature)!==200)
         throw Error("Identical webhook redelivery was not idempotently accepted");
       if(await call(Buffer.concat([latest.raw,Buffer.from(" ")]),
          latest.signature)===200)
         throw Error("Tampered raw webhook was accepted");
       const forged=JSON.parse(latest.raw.toString("utf8"));
       forged.storeId="otherTestStore";
       const bytes=Buffer.from(JSON.stringify(forged));
       const signed="sha256="+createHmac("sha256",secret)
         .update(bytes).digest("hex");
       if(await call(bytes,signed)===200)
         throw Error("Cross-store signed webhook was accepted");
       if(receipts.size!==before)
         throw Error("Webhook replay changed the accepted journal");
       return {duplicateIgnored:true,tamperingRejected:true,
         crossStoreRejected:true};
     },
     async close(){
       await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
     },
   });
 }
 return {begin,process,setInvoiceId,get observationCount(){return observations;}};
}
