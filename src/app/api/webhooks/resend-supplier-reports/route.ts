import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {verifyResendReportEvent}
 from "@/lib/supplier/resend-report-event-verification.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=15;

const responseHeaders={
 "Cache-Control":"private, no-store, max-age=0",
 "X-Content-Type-Options":"nosniff",
};
async function readBoundedText(request:Request){
 if(!request.body)throw Error("missing");
 const reader=request.body.getReader();
 const chunks:Uint8Array[]=[];
 let count=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>65536)throw Error("oversized");
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 return new TextDecoder("utf-8",{fatal:true}).decode(
  Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))));
}

export async function POST(request:Request){
 // A webhook must not access the privileged sender without TWO independent
 // controls: a fresh provider HMAC and the server-held report dispatch token.
 const signingSecret=process.env.RESEND_REPORT_WEBHOOK_SECRET;
 const worker=process.env.APEX_REPORT_DISPATCH_TOKEN;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!signingSecret||!worker||!/^[a-f0-9]{64}$/.test(worker)||
  !url||!key)return NextResponse.json({ok:false},{status:503,
  headers:responseHeaders});
 let event;
 try{
  const payload=await readBoundedText(request);
  event=verifyResendReportEvent({
   payload,svixId:request.headers.get("svix-id"),
   svixTimestamp:request.headers.get("svix-timestamp"),
   svixSignature:request.headers.get("svix-signature"),
   signingSecret,
  });
 }catch{
  // Never report whether an event ID, recipient or provider message exists.
  return NextResponse.json({ok:false},{status:400,headers:responseHeaders});
 }
 const db=createClient(url,key,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
 }});
 try{
  const {data,error}=await db.rpc(
   "record_supplier_daily_report_delivery_event",{
    p_worker_token:worker,p_event_id:event.eventId,
    p_provider_email_id:event.providerEmailId,
    p_event_type:event.eventType,p_occurred_at:event.occurredAt,
   });
  if(error||!data||data.schema_version!==1||
   typeof data.recorded!=="boolean"||
   typeof data.duplicate!=="boolean"||
   data.recorded===data.duplicate)
   throw Error("journal");
  return NextResponse.json({ok:true},{headers:responseHeaders});
 }catch{
  // Retryable, including a provider callback racing the acceptance journal.
  // No customer or recipient information is returned or logged.
  return NextResponse.json({ok:false},{status:503,headers:responseHeaders});
 }
}
