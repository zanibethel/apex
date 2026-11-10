import {NextRequest,NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {saveSupplierPromotion,toggleSupplierPromotion} from "@/app/supplier/discounts/actions";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
const send=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
const ID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z0-9_-]{3,24}$/;
type Store={id:string;display_name:string;is_public:boolean;supplier_id:string};
async function access(){
 const client=await createSupplierServerClient();
 if(!client)return null;
 const {data:auth,error}=await client.auth.getUser();
 const user=auth.user;
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)return null;
 const admin=isVerifiedPlatformAdmin(user);
 let storeIds:string[]=[];
 if(admin){
  const res=await client.from("stores")
   .select("id,display_name,is_public,supplier_id").eq("is_public",false).limit(30);
  if(res.error)return null;
  const stores=(res.data??[]) as Store[];
  return {client,user,admin,stores};
 }
 const members=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(members.error||!members.data?.length)return null;
 const suppliers=members.data.map(m=>m.supplier_id);
 const res=await client.from("stores")
  .select("id,display_name,is_public,supplier_id")
  .in("supplier_id",suppliers).eq("is_public",false).limit(30);
 if(res.error)return null;
 const stores=(res.data??[]) as Store[];
 storeIds=stores.map(s=>s.id);
 if(!storeIds.length)return null;
 return {client,user,admin,stores};
}
function originAllowed(request:NextRequest){
 const origin=request.headers.get("origin");
 const site=request.headers.get("sec-fetch-site");
 return origin===new URL(request.url).origin&&(site===null||site==="same-origin");
}
function scoped(requested:unknown,stores:Store[],admin:boolean,allowGlobal=false){
 if(requested===null&&admin&&allowGlobal)return null;
 const id=requested===undefined?stores[0]?.id:requested;
 return typeof id==="string"&&ID.test(id)&&stores.some(s=>s.id===id)?id:undefined;
}
type Notice={
 id:string;store_id:string|null;headline:string;detail:string;
 href:string|null;starts_at:string|null;ends_at:string|null;
 is_active:boolean;priority:number;updated_at:string;
};
function validNotice(n:unknown):n is Notice{
 if(!n||typeof n!=="object"||Array.isArray(n))return false;
 const x=n as Record<string,unknown>;
 return typeof x.id==="string"&&ID.test(x.id)&&typeof x.headline==="string"&&
 typeof x.detail==="string"&&(x.href===null||x.href==="/"||x.href==="/catalog")&&
 (x.store_id===null||(typeof x.store_id==="string"&&ID.test(x.store_id)))&&
 typeof x.is_active==="boolean"&&typeof x.priority==="number"&&
 typeof x.updated_at==="string"&&
 (x.starts_at===null||typeof x.starts_at==="string")&&
 (x.ends_at===null||typeof x.ends_at==="string");
}
function time(raw:unknown){
 if(raw===null||raw==="")return null;
 if(typeof raw!=="string"||raw.length>50)return undefined;
 const ms=Date.parse(raw);
 return Number.isFinite(ms)?new Date(ms).toISOString():undefined;
}
async function readNotices(context:NonNullable<Awaited<ReturnType<typeof access>>>,storeId:string|null){
 const {data,error}=await context.client.rpc("get_apex_manageable_notices",{p_store_id:storeId});
 const rows=Array.isArray(data)?data.filter(validNotice):[];
 return {ready:!error&&Array.isArray(data)&&rows.length===data.length,rows};
}
const promosEnabled=()=>process.env.APEX_DRAFT_PROMOS_ENABLED==="true";

export async function GET(req:NextRequest){
 const ctx=await access();
 if(!ctx)return send({error:"Verified supplier owner/manager or platform admin access required."},403);
 const chosen=scoped(req.nextUrl.searchParams.get("storeId")||undefined,ctx.stores,ctx.admin);
 const storeId=chosen===undefined?ctx.stores[0]?.id:chosen;
 const noticeScope=ctx.admin?null:storeId;
 const notices=noticeScope!==undefined?await readNotices(ctx,noticeScope):
  {ready:false,rows:[]};
 let discounts:unknown[]=[];
 let discountsReady=false;
 if(storeId){
  const res=await ctx.client.from("supplier_discount_codes")
   .select("id,store_id,code,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count,is_active,updated_at")
   .eq("store_id",storeId).order("created_at",{ascending:false}).limit(60);
  discountsReady=!res.error;
  discounts=res.data??[];
 }
 return send({
  ok:true,admin:ctx.admin,stores:ctx.stores.map(s=>({id:s.id,name:s.display_name})),
  storeId:storeId??null,notices:notices.rows,noticesReady:notices.ready,
  discounts,discountsReady,discountsWritable:promosEnabled()&&discountsReady,
  links:{profile:"/account/profile",payoutReports:"/supplier/reports",
   payoutAdmin:"/admin/splits/configure",paymentMonitor:"/admin/payment-monitor"},
 });
}
export async function POST(req:NextRequest){
 if(!originAllowed(req))return send({error:"Same-origin request required."},403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))
  return send({error:"JSON required."},415);
 if(Number(req.headers.get("content-length")??0)>6000)
  return send({error:"Request too large."},413);
 let body:Record<string,unknown>;
 try{
  const raw=await req.text();if(raw.length>6000)return send({error:"Request too large."},413);
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return send({error:"Invalid request."},400);
  body=parsed as Record<string,unknown>;
 }catch{return send({error:"Invalid request."},400);}
 const ctx=await access();
 if(!ctx)return send({error:"Verified supplier or platform administrator required."},403);
 const storeId=scoped(body.storeId,ctx.stores,ctx.admin,
  body.operation==="save_notice"||body.operation==="toggle_notice");
 if(storeId===undefined)return send({error:"Select an authorized store."},403);
 if(body.operation==="save_notice"||body.operation==="toggle_notice"){
  if(body.operation==="save_notice"&&Object.keys(body).some(k=>!
   ["operation","storeId","id","headline","detail","href","startsAt","endsAt","active","priority","expectedUpdatedAt"].includes(k)))
   return send({error:"Unsupported notice fields."},400);
  if(body.operation==="toggle_notice"&&Object.keys(body).some(k=>!
   ["operation","storeId","id","active","expectedUpdatedAt"].includes(k)))
   return send({error:"Unsupported notice fields."},400);
  let notice:Notice|null=null;
  if(body.operation==="toggle_notice"){
   const list=await readNotices(ctx,ctx.admin?null:storeId);
   if(!list.ready)return send({error:"Announcement management is not installed yet."},503);
   notice=list.rows.find(n=>n.id===body.id&&n.store_id===storeId)??null;
   if(!notice)return send({error:"Notice not found."},404);
   if(notice.updated_at!==body.expectedUpdatedAt)return send({error:"Notice changed; refresh before confirming."},409);
  }
  const input=notice??body;
  const id=notice?notice.id:body.id??null;
  if(!(id===null||(typeof id==="string"&&ID.test(id))))return send({error:"Invalid notice identity."},400);
  const headline=notice?notice.headline:body.headline;
  const detail=notice?notice.detail:body.detail??"";
  const href=notice?notice.href:body.href??null;
  const start=time(notice?notice.starts_at:body.startsAt??null);
  const end=time(notice?notice.ends_at:body.endsAt??null);
  const active=body.active;
  const priority=notice?notice.priority:body.priority??0;
  const expected=notice?notice.updated_at:body.expectedUpdatedAt??null;
  if(typeof headline!=="string"||headline.trim().length<3||headline.trim().length>120||
   typeof detail!=="string"||detail.length>240||
   !(href===null||href==="/"||href==="/catalog")||
   start===undefined||end===undefined||(start&&end&&Date.parse(end)<=Date.parse(start))||
   typeof active!=="boolean"||!Number.isSafeInteger(priority)||Number(priority)<0||Number(priority)>10||
   (id!==null&&(typeof expected!=="string"||!Number.isFinite(Date.parse(expected)))))
   return send({error:"Enter a headline, valid schedule and active status."},400);
  const result=await ctx.client.rpc("save_apex_storefront_notice",{
   p_id:id,p_store_id:storeId,p_headline:headline.trim(),p_detail:detail,p_href:href,
   p_starts_at:start,p_ends_at:end,p_active:active,p_priority:priority,
   p_expected_updated_at:expected,
  });
  if(result.error)return send({error:"Notice not saved. Verify permissions and refresh if someone else edited it."},409);
  revalidatePath("/");revalidatePath("/catalog");
  return send({ok:true,message:"Announcement saved with its active schedule.",notice:result.data});
 }
 if(body.operation==="save_discount"||body.operation==="toggle_discount"){
  if(!storeId)return send({error:"Select a supplier store for discount codes."},400);
  if(!promosEnabled())return send({error:"Discount code editing is disabled for this environment."},503);
  if(body.operation==="toggle_discount"){
   if(Object.keys(body).some(k=>!["operation","storeId","id","active","expectedActive"].includes(k)))
    return send({error:"Unsupported discount fields."},400);
   if(typeof body.id!=="string"||!ID.test(body.id)||
    typeof body.active!=="boolean"||typeof body.expectedActive!=="boolean"||
    body.active===body.expectedActive)return send({error:"Invalid code change."},400);
   const old=await ctx.client.from("supplier_discount_codes")
    .select("id,is_active").eq("store_id",storeId).eq("id",body.id).maybeSingle();
   if(old.error||!old.data||old.data.is_active!==body.expectedActive)
    return send({error:"Code state changed; refresh before confirming."},409);
   const form=new FormData();
   form.set("storeId",storeId);form.set("promoId",body.id);
   form.set("enabled",String(body.active));
   const res=await toggleSupplierPromotion({ok:false,message:""},form);
   return send(res,res.ok?200:409);
  }
  if(Object.keys(body).some(k=>!
   ["operation","storeId","id","code","kind","value","minimum","usageLimit","startsAt","endsAt","active","expectedUpdatedAt"].includes(k)))
   return send({error:"Unsupported discount fields."},400);
  const code=typeof body.code==="string"?body.code.trim().toUpperCase():"";
  const kind=body.kind;
  if(!CODE.test(code)||!["percentage","fixed","free_shipping"].includes(String(kind))||
   typeof body.value!=="string"||typeof body.minimum!=="string"||
   typeof body.usageLimit!=="string"||typeof body.active!=="boolean")
   return send({error:"Invalid code or discount values."},400);
  const id=body.id===null||body.id===""?null:body.id;
  if(id!==null&&!(typeof id==="string"&&ID.test(id)))return send({error:"Invalid code identity."},400);
  if(id){
   const old=await ctx.client.from("supplier_discount_codes").select("id,updated_at,is_active")
    .eq("store_id",storeId).eq("id",id).maybeSingle();
   if(old.error||!old.data||old.data.updated_at!==body.expectedUpdatedAt||
     old.data.is_active!==body.active)
    return send({error:"Code changed; refresh before editing."},409);
  }
  const form=new FormData();
  const fields:Record<string,string>={
   storeId,promoId:typeof id==="string"?id:"",code,kind:String(kind),
   value:body.value,minimum:body.minimum,usageLimit:body.usageLimit,
   startsAt:typeof body.startsAt==="string"?body.startsAt:"",
   endsAt:typeof body.endsAt==="string"?body.endsAt:"",
   initialStatus:body.active?"active":"inactive",
  };
  for(const [k,v] of Object.entries(fields))form.set(k,v);
  const result=await saveSupplierPromotion({ok:false,message:""},form);
  return send(result,result.ok?200:409);
 }
 return send({error:"Unsupported operation."},400);
}
