import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {parseOwnerMailAlertClaim,buildOwnerMailAlertEmail}
 from "@/lib/supplier/owner-mail-alert.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=30;

const OWNER_MAIL=/^[a-z0-9._%+-]+@apexanabolics\.co$/i;
const PROVIDER_ID=/^[A-Za-z0-9_-]{8,128}$/;
const NO_STORE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(v:object,status=200)=>NextResponse.json(v,{
 status,headers:NO_STORE,
});

export async function GET(request:Request){
 // Vercel supplies CRON_SECRET in the Authorization header.
 const cron=process.env.CRON_SECRET;
 if(!cron||cron.length<24||
  request.headers.get("authorization")!=="Bearer "+cron)
  return json({ok:false},401);

 const worker=process.env.APEX_REPORT_DISPATCH_TOKEN;
 const owner=process.env.APEX_OWNER_PROGRESS_EMAIL;
 const apiKey=process.env.RESEND_REPORTS_API_KEY;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!worker||!/^[a-f0-9]{64}$/.test(worker)||!owner||
  !OWNER_MAIL.test(owner)||!apiKey?.startsWith("re_")||!url||!key)
  return json({ok:false,configured:false},503);

 const db=createClient(url,key,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
 }});
 try{
  const {data,error}=await db.rpc("claim_owner_mail_health_alert",{
   p_worker_token:worker,
  });
  if(error)return json({ok:false,stage:"claim"},503);
  const claim=parseOwnerMailAlertClaim(data);
  if(!claim)return json({ok:false,stage:"schema"},503);
  if(claim.state!=="claimed")return json({
   ok:true,providerAccepted:false,reason:claim.state,
  });
  const email=buildOwnerMailAlertEmail(claim);
  const send=await fetch("https://api.resend.com/emails",{
   method:"POST",cache:"no-store",
   headers:{
    Authorization:"Bearer "+apiKey,
    "Content-Type":"application/json",
    "Idempotency-Key":email.idempotencyKey,
   },
   body:JSON.stringify({
    from:"Apex Reports <reports@apexanabolics.co>",
    to:[owner],subject:email.subject,
    text:email.text,html:email.html,
   }),
   signal:AbortSignal.timeout(10000),
  });
  if(!send.ok)return json({
   ok:false,stage:"sender",providerAccepted:false,
  },503);
  const raw:unknown=await send.json();
  const id=raw&&typeof raw==="object"&&"id" in raw&&
   typeof raw.id==="string"&&PROVIDER_ID.test(raw.id)?raw.id:null;
  if(!id)return json({ok:false,stage:"provider_ack"},503);
  const ack=await db.rpc("accept_owner_mail_health_alert",{
   p_worker_token:worker,p_report_day:claim.day,p_provider_email_id:id,
  });
  if(ack.error||ack.data!==true)
   return json({ok:false,stage:"journal_ack",providerAccepted:true},503);
  return json({
   ok:true,providerAccepted:true,delivered:false,
   alertCount:claim.summary.alert_count,
   note:"Provider accepted. Mailbox delivery not independently verified.",
  });
 }catch{
  // Never log or return keys, recipients, payloads, or provider IDs.
  return json({ok:false,stage:"source_or_connection"},503);
 }
}
