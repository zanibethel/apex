import {NextRequest,NextResponse} from "next/server";
import {readApprovedSoldOutCatalog, type ApprovedSoldOutProduct} from "@/lib/supabase/approved-sold-out-catalog";
import {answerApexEmbed} from "@/lib/chat/apex-chat.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const noStore={"Cache-Control":"no-store"};
const send=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:noStore});

// Best-effort per-instance protection; a durable edge quota is required before
// any paid inference is introduced. This endpoint NEVER uses a paid model.
const buckets=new Map<string,{count:number;until:number}>();
function allowed(request:NextRequest){
 const ip=(request.headers.get("x-forwarded-for")??"unknown").split(",")[0].trim().slice(0,80);
 const now=Date.now();
 if(buckets.size>500)for(const [key,value] of buckets)if(value.until<now)buckets.delete(key);
 const entry=buckets.get(ip);
 if(!entry||entry.until<now){buckets.set(ip,{count:1,until:now+60000});return true;}
 if(entry.count>=15)return false;
 entry.count++; return true;
}
type SafeItem={name:string;price:string;availability:string;href:string};
type SafeReply={answer:string;items:SafeItem[];link?:string;source:string};
function validReply(raw:unknown,approved:ApprovedSoldOutProduct[]):SafeReply|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const obj=raw as Record<string,unknown>;
 if(typeof obj.answer!=="string"||obj.answer.length>1200||!Array.isArray(obj.items)||obj.items.length>4)return null;
 const items:SafeItem[]=[];
 for(const item of obj.items){
  if(!item||typeof item!=="object"||Array.isArray(item))return null;
  const v=item as Record<string,unknown>;
  if(typeof v.name!=="string"||v.name.length>120||
     typeof v.price!=="string"||!/^\$[0-9,]+\.[0-9]{2}$/.test(v.price)||
     typeof v.availability!=="string"||v.availability.length>70||
     typeof v.href!=="string"||!/^\/catalog\/product\/[0-9a-f-]{36}$/.test(v.href))return null;
  const matching=approved.find(p=>v.href==="/catalog/product/"+p.id);
  if(!matching||matching.name!==v.name||
     new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(matching.priceCents/100)!==v.price||
     (matching.availability==="in_stock"?"In stock (checkout unavailable)":"Currently unavailable")!==v.availability)
    return null;
  items.push({name:v.name,price:v.price,availability:v.availability,href:v.href});
 }
 const link=obj.link===undefined?undefined:obj.link;
 if(link!==undefined&&!["/catalog","/supplier"].includes(String(link)))return null;
 return {answer:obj.answer,items,link:link as string|undefined,source:"cooperative-code-v1"};
}
async function collectApprovedCatalog(){
 const first=await readApprovedSoldOutCatalog(1);
 const products:ApprovedSoldOutProduct[]=[];
 if(first.state!=="connected")return {state:first.state,products};
 products.push(...first.products);
 let page=first;
 for(let n=2;n<=3&&page.hasNext;n++){
  page=await readApprovedSoldOutCatalog(n);
  if(page.state!=="connected")return {state:"unavailable",products:[]};
  products.push(...page.products);
 }
 return {state:"connected",products};
}
async function callCooperative(payload:object,approved:ApprovedSoldOutProduct[]):Promise<SafeReply|null>{
 const endpoint=process.env.COOPERATIVE_APEX_CHAT_URL;
 const token=process.env.COOPERATIVE_APEX_CHAT_TOKEN;
 if(!endpoint||!token||token.length<32)return null;
 try{
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||url.username||url.password)return null;
  const response=await fetch(url,{
   method:"POST",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify(payload),
   cache:"no-store",
   signal:AbortSignal.timeout(4000),
  });
  if(!response.ok)return null;
  return validReply(await response.json(),approved);
 }catch{return null;}
}
export async function POST(request:NextRequest){
 if(!allowed(request))return send({error:"Too many messages. Please try again shortly."},429);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return send({error:"JSON required"},415);
 if(Number(request.headers.get("content-length")??0)>1024)return send({error:"Message too long"},413);
 let message:unknown;
 try{
  const raw=await request.text();
  if(raw.length>1024)return send({error:"Message too long"},413);
  const body:unknown=JSON.parse(raw);
  message=body&&typeof body==="object"&&!Array.isArray(body)?(body as Record<string,unknown>).message:null;
 }catch{return send({error:"Invalid message"},400);}
 if(typeof message!=="string"||!message.trim()||message.length>300)return send({error:"Enter a shorter message."},400);
 const catalog=await collectApprovedCatalog();
 // Deliberately remove private costs, stock quantities, supplier IDs and images.
 const products=catalog.products.map(p=>({
  id:p.id,name:p.name,priceCents:p.priceCents,currency:p.currency,
  availability:p.availability,categoryName:p.categoryName,
 }));
 const payload={version:1,message:message.trim(),catalogState:catalog.state,products};
 const remote=await callCooperative(payload,catalog.products);
 if(remote)return send(remote);
 const local=answerApexEmbed(payload.message,products,catalog.state);
 return send({...local,source:"apex-local-code-v1"});
}
export async function GET(){return send({error:"Method not allowed"},405);}
