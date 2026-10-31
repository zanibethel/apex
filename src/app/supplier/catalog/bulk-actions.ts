"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {createDraftProduct,updateDraftProduct} from "../operations/actions";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Row={
 key:string;id?:string;name:string;sku:string;description:string;
 price:string;comparePrice:string;categoryId:string;isActive:boolean;
};
type Outcome={key:string;ok:boolean;name:string;message:string;id?:string;sku?:string};
type BulkResult={ok:boolean;message:string;results:Outcome[]};

const moneyPattern=/^\d{1,7}(\.\d{1,2})?$/;
const skuPattern=/^[A-Za-z0-9._-]{1,60}$/;
const denied="Only a signed-in supplier owner or manager can edit this private store.";

async function verifiedStore(storeId:string){
 if(!isValidId(storeId)||process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")return null;
 const client=await createSupplierServerClient();
 if(!client)return null;
 const {data:auth,error}=await client.auth.getUser();
 if(error||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)return null;
 const {data:membership,error:membershipError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(membershipError||!membership?.length)return null;
 const {data:store,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").eq("id",storeId)
  .in("supplier_id",membership.map(m=>m.supplier_id)).eq("is_public",false).maybeSingle();
 if(storeError||!store)return null;
 return client;
}
function parseRows(input:FormDataEntryValue|null){
 if(typeof input!=="string"||input.length>65000)return null;
 try{
  const parsed:unknown=JSON.parse(input);
  if(!Array.isArray(parsed)||parsed.length<1||parsed.length>20)return null;
  if(!parsed.every(r=>r&&typeof r==="object"&&!Array.isArray(r)))return null;
  return parsed as Row[];
 }catch{return null;}
}
function validateRow(r:Row){
 if(typeof r.key!=="string"||r.key.length>60||
  (r.id!==undefined&&!isValidId(r.id))||
  typeof r.name!=="string"||!r.name.trim()||r.name.trim().length>120||
  typeof r.sku!=="string"||(r.sku!==""&&!skuPattern.test(r.sku))||
  typeof r.description!=="string"||r.description.length>1500||
  typeof r.price!=="string"||!moneyPattern.test(r.price)||Number(r.price)<=0||
  typeof r.comparePrice!=="string"||
  (r.comparePrice!==""&&(!moneyPattern.test(r.comparePrice)||
    Number(r.comparePrice)<=Number(r.price)))||
  typeof r.categoryId!=="string"||
  (r.categoryId!==""&&!isValidId(r.categoryId))||
  typeof r.isActive!=="boolean")return false;
 return r.id?r.sku.length>0:true;
}
export async function saveBulkProductDrafts(_previous:BulkResult,form:FormData):Promise<BulkResult>{
 const storeId=form.get("storeId");
 if(typeof storeId!=="string")return {ok:false,message:denied,results:[]};
 const client=await verifiedStore(storeId);
 if(!client)return {ok:false,message:denied,results:[]};
 const rows=parseRows(form.get("rows"));
 if(!rows)return {ok:false,message:"Choose 1–20 rows to save at a time.",results:[]};
 if(new Set(rows.map(r=>r.key)).size!==rows.length ||
    rows.some(r=>typeof r.key!=="string"||!r.key))
  return {ok:false,message:"Duplicate or invalid row identifiers.",results:[]};
 const outcomes:Outcome[]=[];
 for(const row of rows){
  const name=typeof row.name==="string"?row.name.trim().slice(0,120):"Invalid product";
  if(!validateRow(row)){
   outcomes.push({key:row.key,ok:false,name,message:"Invalid fields. Check name, SKU, price and category."});continue;
  }
  const rowForm=new FormData();
  rowForm.set("storeId",storeId);
  rowForm.set("name",row.name.trim());
  rowForm.set("sku",row.sku);
  rowForm.set("description",row.description);
  rowForm.set("price",row.price);
  rowForm.set("comparePrice",row.comparePrice);
  rowForm.set("categoryId",row.categoryId);
  if(row.isActive)rowForm.set("isActive","on");
  if(row.id)rowForm.set("productId",row.id);
  else rowForm.set("directSourceCost","");
  const saved=row.id?await updateDraftProduct({ok:false,message:""},rowForm)
    :await createDraftProduct({ok:false,message:""},rowForm);
  if(!saved.ok){outcomes.push({key:row.key,ok:false,name,message:saved.message});continue;}
  // createDraftProduct returns the exact inserted ID. A blank SKU is generated
  // randomly, so never rederive it by calling chooseNewSku again.
  const productId=row.id||("productId" in saved&&typeof saved.productId==="string"
    ?saved.productId:undefined);
  outcomes.push({key:row.key,ok:!!productId,name,
   message:productId?"Saved to your private catalog.": "Saved but could not confirm the new product ID; refresh catalog.",
   id:productId,sku:("sku" in saved && typeof saved.sku==="string")?saved.sku:row.sku});
 }
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/supplier/catalog/bulk/preview");
 const successful=outcomes.filter(x=>x.ok).length;
 return {ok:successful===outcomes.length,
  message:`${successful} of ${outcomes.length} selected rows confirmed saved. Review any errors before previewing.`,
  results:outcomes};
}

type PublishOutcome={id:string;ok:boolean;message:string};
type PublishResult={ok:boolean;message:string;results:PublishOutcome[]};

export async function saveBulkPublicationRequests(_previous:PublishResult,form:FormData):Promise<PublishResult>{
 const storeId=form.get("storeId"),raw=form.get("ids");
 if(typeof storeId!=="string"||typeof raw!=="string")
  return {ok:false,message:denied,results:[]};
 const client=await verifiedStore(storeId);
 if(!client)return {ok:false,message:denied,results:[]};
 const ids=raw.split(",").filter(Boolean);
 if(ids.length<1||ids.length>50||new Set(ids).size!==ids.length||ids.some(x=>!isValidId(x)))
  return {ok:false,message:"Choose 1–50 different products per publication batch.",results:[]};
 const {data:found,error}=await client.from("products")
  .select("id,store_id,is_published").eq("store_id",storeId).in("id",ids);
 if(error||!found||found.length!==ids.length||found.some(p=>p.is_published))
  return {ok:false,message:"One or more products are not in this private supplier store.",results:[]};
 const results:PublishOutcome[]=[];
 for(const id of ids){
  const {data,error:rpcError}=await client.rpc("set_supplier_listing_intent",{
   p_store_id:storeId,p_product_id:id,p_action:"publish",
  });
  results.push({id,ok:!rpcError&&!!data,message:rpcError?
   "Not requested: check required product details and any administrator hold.":
   "Publication request saved privately."});
 }
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/supplier/catalog/bulk/preview");
 revalidatePath("/admin/listing-controls");
 const saved=results.filter(r=>r.ok).length;
 return {ok:saved===results.length,
  message:`${saved} of ${results.length} product requests saved. Public release remains disabled.`,
  results};
}
