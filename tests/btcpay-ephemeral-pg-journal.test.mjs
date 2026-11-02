import test from "node:test";
import assert from "node:assert/strict";
import {createEphemeralPgBridge} from "../scripts/btcpay-ephemeral-pg-journal.mjs";
const input={
 storeId:"syntheticStore01",invoiceId:"syntheticInvoice01",
 orderId:"APEX-REGTEST-001",amountSats:10000n,
};
const event={type:"InvoiceSettled",storeId:input.storeId,invoiceId:input.invoiceId,
 deliveryId:"delivery001"};
const invoice={id:input.invoiceId,storeId:input.storeId,
 metadata:{orderId:input.orderId},currency:"BTC",amount:"0.00010000",
 status:"Settled",additionalStatus:"None"};
const payloadSha256="a".repeat(64);
test("rejects non-regtest and missing test-only flag before IO",()=>{
 assert.throws(()=>createEphemeralPgBridge({testOnly:false,network:"regtest"}));
 assert.throws(()=>createEphemeralPgBridge({testOnly:true,network:"mainnet"}));
});
test("verified event uses SQL snapshot, private atomic writer and exact readback",async()=>{
 const calls=[];
 const bridge=createEphemeralPgBridge({testOnly:true,network:"regtest",
   runPsql:async(args)=>{
     calls.push(args);
     if(args.at(-1).endsWith("btcpay-live-journal-seed.sql"))return "seeded";
     if(args.at(-1).endsWith("btcpay-live-journal-record.sql"))return "accepted";
     if(args.at(-1).endsWith("btcpay-live-journal-check.sql"))return "passed";
     throw Error("Unexpected SQL statement");
   },
 });
 await bridge.initialize(input);
 assert.equal(await bridge.recordVerified({event,invoice,payloadSha256}),"accepted");
 assert.equal(await bridge.assertSettledOnce(),true);
 assert.equal(calls.length,3);
 for(const args of calls){
   assert.ok(args.includes("-X") && args.includes("ON_ERROR_STOP=1"));
   assert.equal(args.at(-2),"-f");
   assert.ok(!args.some(x=>/password|seed phrase|mnemonic|apiKey/i.test(x)));
 }
 assert.ok(calls[1].includes("provider_status=Settled"));
 assert.ok(calls[1].includes("amount_sats=10000"));
});
test("repeat identical delivery uses durable duplicate result",async()=>{
 let entries=0;
 const bridge=createEphemeralPgBridge({testOnly:true,network:"regtest",
   runPsql:async(args)=>{
     if(args.at(-1).endsWith("-seed.sql"))return "seeded";
     if(args.at(-1).endsWith("btcpay-live-journal-seed.sql"))return "seeded";
     entries++;
     return entries===1?"accepted":"duplicate";
   },
 });
 await bridge.initialize(input);
 assert.equal(await bridge.recordVerified({event,invoice,payloadSha256}),"accepted");
 assert.equal(await bridge.recordVerified({event,invoice,payloadSha256}),"duplicate");
});
test("wrong order, amount, currency, network or status never writes",async()=>{
 let calls=0;
 const bridge=createEphemeralPgBridge({testOnly:true,network:"regtest",
   runPsql:async(args)=>{
     calls++;
     return args.at(-1).endsWith("seed.sql")?"seeded":"accepted";
   },
 });
 await bridge.initialize(input);
 const initial=calls;
 for(const change of [
   {invoice:{...invoice,amount:"0.00020000"}},
   {invoice:{...invoice,currency:"USD"}},
   {invoice:{...invoice,metadata:{orderId:"other"}}},
   {invoice:{...invoice,status:"Unknown"}},
   {event:{...event,storeId:"another"}},
   {event:{...event,deliveryId:"quote'injection"}},
 ]) {
   await assert.rejects(bridge.recordVerified({
     event:change.event||event,invoice:change.invoice||invoice,payloadSha256,
   }));
 }
 assert.equal(calls,initial);
});
test("database failure fails closed, no accepted record or secret in error",async()=>{
 const bridge=createEphemeralPgBridge({testOnly:true,network:"regtest",
   runPsql:async(args)=>{
     if(args.at(-1).endsWith("seed.sql"))return "seeded";
     throw Error("SECRET SQL DRIVER DETAIL");
   },
 });
 await bridge.initialize(input);
 await assert.rejects(bridge.recordVerified({event,invoice,payloadSha256}),
    e=>e.message==="Disposable PostgreSQL journal transaction failed");
});
