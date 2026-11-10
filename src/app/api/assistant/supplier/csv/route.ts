import {NextRequest,NextResponse} from "next/server";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {saveBulkProductDrafts} from "@/app/supplier/catalog/bulk-actions";
import {SUPPLIER_CHAT_CSV_BATCH_SIZE,validateSupplierChatCsv,planSupplierChatCsv} from "@/lib/chat/supplier-csv.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
const MAX_BODY=270000;
const quota=new Map<string,{count:number;until:number}>();
function rateLimit(userId:string){
 const now=Date.now();
 for(const [key,item] of quota)if(item.until<=now)quota.delete(key);
 if(quota.size>=500&&!quota.has(userId))return false;
 const item=quota.get(userId);
 if(!item){quota.set(userId,{count:1,until:now+60000});return true;}
 if(item.count>=12)return false;
 item.count++;
 return true;
}
function sameOrigin(request:NextRequest){
 const origin=request.headers.get("origin");
 const site=request.headers.get("sec-fetch-site");
 return origin===new URL(request.url).origin&&(site===null||site==="same-origin");
}
async function supplierContext(){
 const client=await createSupplierServerClient();
 if(!client)return {error:"Supplier sign-in required.",status:401} as const;
 const {data:auth,error}=await client.auth.getUser();
 const user=auth.user;
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)
  return {error:"Supplier sign-in required.",status:401} as const;
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)
  return {error:"Supplier owner/manager access required.",status:403} as const;
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||stores?.length!==1)return {
  error:"A single authorized supplier storefront is required.",status:409
 } as const;
 return {client,store:stores[0],user} as const;
}
type RequestBody={operation:"preview"|"import";csvText:string;batchOffset?:number};
export async function POST(request:NextRequest){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return respond({error:"JSON request required."},415);
 if(Number(request.headers.get("content-length")??0)>MAX_BODY)
  return respond({error:"CSV payload is too large."},413);
 if(!sameOrigin(request))return respond({error:"Same-origin supplier request required."},403);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>MAX_BODY)return respond({error:"CSV payload is too large."},413);body=JSON.parse(raw);}
 catch{return respond({error:"Invalid CSV request."},400);}
 if(!body||Array.isArray(body)||typeof body!=="object")return respond({error:"Invalid CSV request."},400);
 const params=body as Record<string,unknown>;
 if(Object.keys(params).some(x=>!["operation","csvText","batchOffset"].includes(x))||
    (params.operation!=="preview"&&params.operation!=="import")||
    typeof params.csvText!=="string"||
    new TextEncoder().encode(params.csvText).length>256000)
  return respond({error:"Invalid CSV request or size."},400);
 const requestedOffset=params.batchOffset??0;
 if(!Number.isSafeInteger(requestedOffset)||Number(requestedOffset)<0||
    Number(requestedOffset)%SUPPLIER_CHAT_CSV_BATCH_SIZE!==0)
  return respond({error:"Invalid CSV batch."},400);

 const context=await supplierContext();
 if("error" in context)return respond({error:context.error},context.status);
 const {client,store,user}=context;
 if(!rateLimit(user.id))return respond({error:"Too many supplier imports. Retry later."},429);
 const [{data:categories,error:categoryError,count:categoryCount},
        {data:products,error:productError,count:productCount}]=await Promise.all([
  client.from("categories").select("id,name",{count:"exact"})
   .eq("store_id",store.id).order("name").limit(250),
  client.from("products").select("id,sku,name,price_cents",{count:"exact"})
   .eq("store_id",store.id).is("archived_at",null).order("sku").limit(250),
 ]);
 if(categoryError||productError||categoryCount===null||productCount===null||
    categoryCount!==categories?.length||productCount!==products?.length)
  return respond({error:"Unable to verify the complete supplier catalog. No CSV changes were made."},503);
 const validation=validateSupplierChatCsv(params.csvText,categories??[]);
 if(!validation.ok)
  return respond({error:"Fix the CSV issues before importing.",errors:validation.errors},422);
 if(validation.rows.length===0)return respond({error:"CSV has no product records."},422);
 const plan=planSupplierChatCsv(validation.rows,products??[]);
 if(plan.conflicts.length)return respond({
   error:"Existing product SKU conflicts. No products were changed. Use the Products CSV editor for updates.",
   conflicts:plan.conflicts.slice(0,20),
 },409);
 if(params.operation==="preview"){
  return respond({ok:true,source:"apex-supplier-csv-code-v1",
   rowCount:validation.rows.length,newCount:plan.creates.length,skippedCount:plan.skipped.length,
   preview:validation.rows.slice(0,5).map(p=>({sku:p.sku,name:p.name,price:p.price,tags:p.tags})),
   answer:"Preview only. Nothing saved. Confirm import to create private supplier drafts in batches of 20. Existing matching SKUs will be skipped. This does not publish products or create BTCPay charges.",
   public:false,
  });
 }
 if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
  return respond({error:"Supplier product editing is currently disabled."},503);
 const offset=Number(requestedOffset);
 if(offset>=validation.rows.length)return respond({error:"CSV batch is out of range."},400);
 const subset=validation.rows.slice(offset,offset+SUPPLIER_CHAT_CSV_BATCH_SIZE);
 const createKeys=new Set(plan.creates.map(x=>x.key));
 const newRows=subset.filter(x=>createKeys.has(x.key));
 const skipped=subset.length-newRows.length;
 if(!newRows.length)return respond({ok:true,created:0,skipped,failed:[],processed:subset.length,
  nextOffset:offset+subset.length,total:validation.rows.length,public:false});
 const form=new FormData();
 form.set("storeId",store.id);
 form.set("rows",JSON.stringify(newRows));
 const result=await saveBulkProductDrafts({ok:false,message:"",results:[]},form);
 const created=result.results.filter(x=>x.ok).length;
 const failed=result.results.filter(x=>!x.ok).map(x=>({name:x.name,message:x.message}));
 return respond({ok:failed.length===0,source:"apex-supplier-csv-code-v1",
  created,skipped,failed,processed:subset.length,
  nextOffset:offset+subset.length,total:validation.rows.length,
  answer:created+" private supplier products created; "+skipped+" existing SKUs skipped. Products are not publicly published.",
  public:false},200);
}
export async function GET(){return respond({error:"Method not allowed."},405);}
