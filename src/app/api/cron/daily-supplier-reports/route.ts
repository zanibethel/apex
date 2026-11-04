import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const CURRENCY=/^(0|[1-9]\d{0,14})$/;
type DispatchItem={
 dispatch_id:string;store_id:string;report_date:string;email:string;
 recorded_order_count:number;pending_order_count:number;confirmed_order_count:number;
 refunded_order_count:number;cancelled_order_count:number;
 pending_gross_cents:string;confirmed_gross_cents:string;
 refunded_gross_cents:string;confirmed_btc_sats:string;
};

function validItem(input:unknown):input is DispatchItem{
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const v=input as Record<string,unknown>;
 const integer=(key:string)=>Number.isSafeInteger(v[key])&&
  (v[key] as number)>=0;
 const money=(key:string)=>typeof v[key]==="string"&&
  CURRENCY.test(v[key] as string);
 return typeof v.dispatch_id==="string"&&UUID.test(v.dispatch_id)&&
  typeof v.store_id==="string"&&UUID.test(v.store_id)&&
  typeof v.report_date==="string"&&DAY.test(v.report_date)&&
  typeof v.email==="string"&&v.email.length<=254&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)&&
  ["recorded_order_count","pending_order_count","confirmed_order_count",
   "refunded_order_count","cancelled_order_count"].every(integer)&&
  ["pending_gross_cents","confirmed_gross_cents","refunded_gross_cents",
   "confirmed_btc_sats"].every(money)&&
  (v.pending_order_count as number)+(v.confirmed_order_count as number)+
   (v.refunded_order_count as number)+(v.cancelled_order_count as number)===
   v.recorded_order_count;
}
function usd(value:string){
 return new Intl.NumberFormat("en-US",{
  style:"currency",currency:"USD",
 }).format(Number(value)/100);
}
function emailText(v:DispatchItem){
 return [
  "Apex Anabolics — Daily Order Report",
  "Date: "+v.report_date+" (America/Chicago)",
  "",
  "Recorded orders: "+v.recorded_order_count,
  "Confirmed orders: "+v.confirmed_order_count,
  "Pending orders: "+v.pending_order_count,
  "Refunded orders: "+v.refunded_order_count,
  "Cancelled orders: "+v.cancelled_order_count,
  "",
  "Confirmed gross sales: "+usd(v.confirmed_gross_cents),
  "Pending gross: "+usd(v.pending_gross_cents),
  "Refunded gross: "+usd(v.refunded_gross_cents),
  "Confirmed Bitcoin: "+v.confirmed_btc_sats+" sats",
  "",
  "Reports are based on recorded orders, not projected sales or payouts.",
  "View your report: https://apexanabolics.co/supplier/reports/daily",
  "You can turn off email reports under Daily Order Reports in your dashboard.",
 ].join("\n");
}
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<24||
  request.headers.get("authorization")!==`Bearer ${secret}`){
  return NextResponse.json({ok:false},{status:401,
   headers:{"Cache-Control":"no-store"}});
 }
 const resend=process.env.RESEND_REPORTS_API_KEY;
 const worker=process.env.APEX_REPORT_DISPATCH_TOKEN;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!resend||!worker||!url||!key||!/^[a-f0-9]{64}$/.test(worker)){
  return NextResponse.json({ok:false,configured:false},{status:503});
 }
 const db=createClient(url,key,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
 }});
 const result=await db.rpc("claim_supplier_daily_report_emails",{
  p_worker_token:worker,p_limit:15,
 });
 if(result.error||!result.data||result.data.schema_version!==1||
  !Array.isArray(result.data.items)||result.data.items.length>15){
  return NextResponse.json({ok:false,stage:"claim"},{status:503});
 }
 let accepted=0,failed=0;
 for(const item of result.data.items as unknown[]){
  if(!validItem(item)){failed++;continue;}
  try{
   // Stable ID across retries avoids duplicate messages if the job is repeated.
   const send=await fetch("https://api.resend.com/emails",{
    method:"POST",
    cache:"no-store",
    headers:{
     Authorization:`Bearer ${resend}`,
     "Content-Type":"application/json",
     "Idempotency-Key":"apex-daily-"+item.dispatch_id,
    },
    body:JSON.stringify({
     from:"Apex Reports <reports@apexanabolics.co>",
     to:[item.email],
     subject:"Apex daily order report — "+item.report_date,
     text:emailText(item),
    }),
    signal:AbortSignal.timeout(10000),
   });
   if(!send.ok){failed++;continue;}
   const body:unknown=await send.json();
   const providerId=body&&typeof body==="object"&&
    "id" in body&&(typeof body.id==="string")?body.id:null;
   if(!providerId||!/** ASCII provider ID only */^[A-Za-z0-9_-]{8,128}$/.test(providerId)){
    failed++;continue;
   }
   const ack=await db.rpc("accept_supplier_daily_report_email",{
    p_worker_token:worker,p_dispatch_id:item.dispatch_id,
    p_provider_email_id:providerId,
   });
   if(ack.error||ack.data!==true){failed++;continue;}
   accepted++;
  }catch{
   failed++;
  }
 }
 return NextResponse.json({
  ok:failed===0,queued:result.data.items.length,accepted,failed,
  note:"Accepted by provider; final mailbox delivery is not independently confirmed.",
 },{status:failed?503:200,headers:{"Cache-Control":"no-store"}});
}
