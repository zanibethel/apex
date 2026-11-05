// Resend/Svix signed event verification for report-delivery evidence.
// Pure, server-only adapter. Never persist or expose raw payloads/recipient PII.
import {createHmac,timingSafeEqual} from "node:crypto";

export class ReportEventError extends Error {
 constructor(code){super("Report event verification denied");this.name="ReportEventError";this.code=code;}
}
const EVENTS=new Set([
 "email.sent","email.delivered","email.bounced","email.complained",
 "email.failed","email.delivery_delayed","email.suppressed",
]);
const ID=/^[A-Za-z0-9_-]{8,160}$/;
const EMAIL_ID=/^[A-Za-z0-9_-]{8,128}$/;
const ADDR=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENDER=new Set([
 "reports@apexanabolics.co",
 "apex reports <reports@apexanabolics.co>",
]);

function signatureBytes(value){
 if(typeof value!=="string"||!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(value))
  return null;
 const encoded=value.slice(3);
 const raw=Buffer.from(encoded,"base64");
 return raw.length===32&&raw.toString("base64").replace(/=+$/,"")===
  encoded.replace(/=+$/,"")?raw:null;
}

export function verifyResendReportEvent({
 payload,svixId,svixTimestamp,svixSignature,signingSecret,
 nowSeconds=Math.floor(Date.now()/1000),
}){
 if(typeof payload!=="string"||Buffer.byteLength(payload,"utf8")>65536||
  payload.length<2)throw new ReportEventError("payload");
 if(typeof svixId!=="string"||!ID.test(svixId))
  throw new ReportEventError("event_id");
 if(typeof svixTimestamp!=="string"||
  !/^[1-9]\d{9}$/.test(svixTimestamp)||
  !Number.isSafeInteger(nowSeconds)||
  Math.abs(nowSeconds-Number(svixTimestamp))>300)
  throw new ReportEventError("timestamp");
 if(typeof signingSecret!=="string"||
  !/^whsec_[A-Za-z0-9+/_=-]{24,}$/.test(signingSecret))
  throw new ReportEventError("configuration");
 const secret=Buffer.from(signingSecret.slice(6),"base64");
 if(secret.length<16)throw new ReportEventError("configuration");
 const expected=createHmac("sha256",secret)
  .update(svixId+"."+svixTimestamp+"."+payload,"utf8").digest();
 const signatures=typeof svixSignature==="string"?
  svixSignature.split(/\s+/).map(signatureBytes).filter(Boolean):[];
 if(!signatures.length||!signatures.some(value=>
  timingSafeEqual(expected,value)))
  throw new ReportEventError("signature");
 let event;
 try{event=JSON.parse(payload);}
 catch{throw new ReportEventError("json");}
 if(!event||typeof event!=="object"||Array.isArray(event)||
  !EVENTS.has(event.type)||typeof event.created_at!=="string"||
  !Number.isFinite(Date.parse(event.created_at))||
  !event.data||typeof event.data!=="object"||
  Array.isArray(event.data))
  throw new ReportEventError("schema");
 const data=event.data;
 if(typeof data.email_id!=="string"||!EMAIL_ID.test(data.email_id)||
  typeof data.from!=="string"||
  !SENDER.has(data.from.trim().toLowerCase())||
  !Array.isArray(data.to)||data.to.length!==1||
  typeof data.to[0]!=="string"||data.to[0].length>254||
  !ADDR.test(data.to[0]))
  throw new ReportEventError("scope");
 return Object.freeze({
  eventId:svixId,providerEmailId:data.email_id,
  eventType:event.type,occurredAt:new Date(event.created_at).toISOString(),
  signatureVerified:true,
  // A verified event alone is not authorization to update an order or
  // proof of final inbox display. Persistence/deduplication is separate.
  shipmentAuthorized:false,paymentAuthorized:false,
 });
}
