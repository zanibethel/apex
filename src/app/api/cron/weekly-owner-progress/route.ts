import {NextResponse} from "next/server";
import {normalizeProgress,renderProgressEmail} from "@/lib/owner-progress-email.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;

const OWNER_MAIL=/^[a-z0-9._%+-]+@apexanabolics\.co$/i;
const GITHUB="https://api.github.com/repos/zanibethel/apex";
async function githubRows(path:string){
 const response=await fetch(GITHUB+path,{
  headers:{
   Accept:"application/vnd.github+json",
   "User-Agent":"apex-owner-weekly-digest",
   "X-GitHub-Api-Version":"2022-11-28",
  },
  cache:"no-store",
  signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw Error("GitHub progress source unavailable");
 const rows:unknown=await response.json();
 if(!Array.isArray(rows)||rows.length>100)
  throw Error("Unexpected GitHub progress source");
 return rows;
}
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<24||
  request.headers.get("authorization")!=="Bearer "+secret){
  return NextResponse.json({ok:false},{status:401,
   headers:{"Cache-Control":"no-store"}});
 }
 const owner=process.env.APEX_OWNER_PROGRESS_EMAIL;
 const apiKey=process.env.RESEND_REPORTS_API_KEY;
 if(!owner||!OWNER_MAIL.test(owner)||!apiKey||!apiKey.startsWith("re_")){
  return NextResponse.json({ok:false,configured:false},{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
 const now=new Date();
 try{
  const [pulls,issues]=await Promise.all([
   githubRows("/pulls?state=closed&sort=updated&direction=desc&per_page=100"),
   githubRows("/issues?state=open&sort=updated&direction=desc&per_page=100"),
  ]);
  const progress=normalizeProgress({pulls,issues,now});
  const email=renderProgressEmail({now,progress});
  const send=await fetch("https://api.resend.com/emails",{
   method:"POST",cache:"no-store",
   headers:{
    Authorization:"Bearer "+apiKey,
    "Content-Type":"application/json",
    "Idempotency-Key":email.idempotencyKey,
   },
   body:JSON.stringify({
    from:"Apex Reports <reports@apexanabolics.co>",
    to:[owner],
    subject:email.subject,
    text:email.text,html:email.html,
   }),
   signal:AbortSignal.timeout(10000),
  });
  if(!send.ok)return NextResponse.json({
   ok:false,stage:"sender",providerAccepted:false,
  },{status:503,headers:{"Cache-Control":"no-store"}});
  const data:unknown=await send.json();
  if(!data||typeof data!=="object"||
   !("id" in data)||typeof data.id!=="string"||
   !/^[A-Za-z0-9_-]{8,128}$/.test(data.id))
   return NextResponse.json({ok:false,stage:"acknowledgement"},{status:503});
  return NextResponse.json({
   ok:true,providerAccepted:true,delivered:false,
   reportDate:email.idempotencyKey.slice(-10),
   completionEntries:progress.completed.length,
   pendingEntries:progress.pending.length,
  },{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({ok:false,stage:"source_or_connection"},{status:503,
   headers:{"Cache-Control":"no-store"}});
 }
}
