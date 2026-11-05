import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {verifyResendReportEvent,ReportEventError}
 from "../src/lib/supplier/resend-report-event-verification.mjs";

const now=Math.floor(Date.parse("2026-11-05T10:00:00.000Z")/1000);
const rawKey=Buffer.alloc(32,47);
const signingSecret="whsec_"+rawKey.toString("base64");
const eventId="msg_abcdef123456";
const original={
 type:"email.delivered",created_at:"2026-11-05T09:59:30.000Z",
 data:{
  email_id:"d1f56788-7520-42d8-8898-ff6fc54ce618",
  from:"Apex Reports <reports@apexanabolics.co>",
  to:["verified@example.org"],
  subject:"Report",
  message_id:"<provider-delivery@example.org>",
  tags:{ignored:"no private persistence"},
 },
};
function signed(event=original,custom={}){
 const payload=JSON.stringify(event);
 const svixTimestamp=String(now);
 const digest=createHmac("sha256",rawKey)
  .update(eventId+"."+svixTimestamp+"."+payload).digest("base64");
 return {payload,svixId:eventId,svixTimestamp,
  svixSignature:"v1,"+digest,signingSecret,nowSeconds:now,...custom};
}
const rejects=(args,code)=>assert.throws(
 ()=>verifyResendReportEvent(args),
 e=>e instanceof ReportEventError&&e.code===code);

test("valid provider-signed delivered event produces metadata without buyer or recipient PII",()=>{
 const result=verifyResendReportEvent(signed());
 assert.deepEqual(result,{
  eventId,providerEmailId:original.data.email_id,
  eventType:"email.delivered",
  occurredAt:"2026-11-05T09:59:30.000Z",
  signatureVerified:true,shipmentAuthorized:false,paymentAuthorized:false,
 });
 assert.equal(Object.isFrozen(result),true);
 for(const field of ["to","from","subject","address","message_id","email"])
  assert.equal(Object.hasOwn(result,field),false);
});

test("signed bounced, complained, delayed, failed and suppressed events are accepted only as event evidence",()=>{
 for(const kind of ["email.bounced","email.complained",
  "email.delivery_delayed","email.failed","email.suppressed","email.sent"]){
  const result=verifyResendReportEvent(signed({...original,type:kind}));
  assert.equal(result.eventType,kind);
  assert.equal(result.shipmentAuthorized,false);
 }
});

test("signature is bound to raw bytes, event id, timestamp and known key",()=>{
 const valid=signed();
 rejects({...valid,payload:valid.payload+" "},"signature");
 rejects({...valid,svixId:"msg_other123456"},"signature");
 rejects({...valid,svixTimestamp:String(now+1)},"signature");
 rejects({...valid,signingSecret:"whsec_"+Buffer.alloc(32,11).toString("base64")},"signature");
 rejects({...valid,svixSignature:"v1,"+Buffer.alloc(32,2).toString("base64")},"signature");
 rejects({...valid,svixSignature:"malformed"},"signature");
 rejects({...valid,svixSignature:""},"signature");
 const several={...valid,svixSignature:
  "v1,"+Buffer.alloc(32,2).toString("base64")+" "+valid.svixSignature};
 assert.equal(verifyResendReportEvent(several).signatureVerified,true);
});

test("replayed old and future signatures are denied even if cryptographically valid",()=>{
 const valid=signed();
 rejects({...valid,nowSeconds:now+301},"timestamp");
 rejects({...valid,nowSeconds:now-301},"timestamp");
 rejects({...valid,svixTimestamp:"nan"},"timestamp");
 rejects({...valid,svixId:"bad id"},"event_id");
});

test("events from another product or with multiple recipients are never treated as Apex report evidence",()=>{
 const cases=[
  {...original,data:{...original.data,from:"other@example.org"}},
  {...original,data:{...original.data,to:["a@example.org","b@example.org"]}},
  {...original,data:{...original.data,to:[]}},
  {...original,data:{...original.data,to:["bad address"]}},
  {...original,data:{...original.data,email_id:"invalid"}},
 ];
 for(const event of cases)rejects(signed(event),"scope");
});

test("unknown event category, invalid JSON, malformed time or oversized raw payload fail closed",()=>{
 rejects(signed({...original,type:"email.received"}),"schema");
 rejects(signed({...original,created_at:"no date"}),"schema");
 rejects(signed(original,{payload:"{"}),"payload");
 const malformed="{invalid-json}";
 const signature=createHmac("sha256",rawKey)
  .update(eventId+"."+String(now)+"."+malformed).digest("base64");
 rejects(signed(original,{payload:malformed,svixSignature:"v1,"+signature}),"json");
 rejects(signed(original,{payload:"x".repeat(65537)}),"payload");
 rejects(signed(original,{signingSecret:"bad"}),"configuration");
});

test("signature verification is stateless: durable deduplication still required before marking delivery",()=>{
 const args=signed(original);
 const first=verifyResendReportEvent(args);
 const repeated=verifyResendReportEvent(args);
 assert.deepEqual(first,repeated);
 assert.equal(Object.hasOwn(first,"delivered"),false);
});
