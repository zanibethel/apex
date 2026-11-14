"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
const fail=(message:string):Result=>({ok:false,message});
const inchToMm=(raw:FormDataEntryValue|null)=>{
 if(typeof raw!=="string"||!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(raw))return null;
 const mm=Math.round(Number(raw)*25.4);
 return Number.isInteger(mm)&&mm>=1&&mm<=2000?mm:null;
};
const ouncesToGrams=(raw:FormDataEntryValue|null)=>{
 if(typeof raw!=="string"||!/^(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{1,2})?$/.test(raw))return null;
 const g=Math.ceil(Number(raw)*28.349523125);
 return Number.isInteger(g)&&g>=1&&g<=31750?g:null;
};
const refresh=()=>{
 for(const p of ["/supplier/shipping","/supplier/catalog/bulk","/cart","/checkout","/catalog"])
  revalidatePath(p);
};

async function access(form:FormData){
 const storeId=form.get("storeId"),productId=form.get("productId");
 if(typeof storeId!=="string"||!isValidId(storeId)||
  typeof productId!=="string"||!isValidId(productId)||
  process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")return null;
 const client=await createSupplierServerClient();
 if(!client)return null;
 const {data:identity,error}=await client.auth.getUser();
 if(error||!identity.user||identity.user.is_anonymous||!identity.user.email_confirmed_at)return null;
 const {data:members,error:membershipError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(membershipError||!members?.length)return null;
 const {data:store,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").eq("id",storeId).eq("is_public",false)
  .in("supplier_id",members.map(m=>m.supplier_id)).maybeSingle();
 if(storeError||!store||
  !members.some(m=>m.supplier_id===store.supplier_id&&
    (m.role==="owner"||m.role==="manager")))return null;
 const {data:product,error:productError}=await client.from("products")
  .select("id").eq("store_id",storeId).eq("id",productId)
  .eq("is_published",false).is("archived_at",null).maybeSingle();
 if(productError||!product)return null;
 return {client,storeId,productId,userId:identity.user.id};
}
export async function saveProductShippingProfile(_previous:Result,form:FormData):Promise<Result>{
 const session=await access(form);
 if(!session)return fail("An authorized supplier owner or manager must sign in.");
 const length_mm=inchToMm(form.get("lengthInches")),
  width_mm=inchToMm(form.get("widthInches")),
  height_mm=inchToMm(form.get("heightInches")),
  weight_g=ouncesToGrams(form.get("weightOunces"));
 const flexible=form.get("flexible")==="true";
 if([length_mm,width_mm,height_mm,weight_g].some(x=>x===null)||
  (form.get("flexible")!=="true"&&form.get("flexible")!=="false"))
  return fail("Enter positive packed dimensions (inches) and weight (ounces).");
 const {client,storeId,productId,userId}=session;
 const expected=form.get("expectedUpdatedAt");
 if(typeof expected!=="string"||(expected!=="none"&&
  (expected.length>80||!Number.isFinite(Date.parse(expected)))))
  return fail("Shipping profile version unavailable. Refresh and retry.");
 const {data:current,error:readError}=await client.from("supplier_product_shipping_profiles")
  .select("updated_at").eq("store_id",storeId).eq("product_id",productId).maybeSingle();
 if(readError)return fail("Shipping profile currently unavailable.");
 if((current?.updated_at??"none")!==expected)
  return fail("Measurements changed since you opened this page. Refresh and retry.");
 const values={length_mm:length_mm!,width_mm:width_mm!,height_mm:height_mm!,
  weight_g:weight_g!,flexible,updated_by:userId,updated_at:new Date().toISOString()};
 if(current){
  const {data,error}=await client.from("supplier_product_shipping_profiles")
   .update(values).eq("store_id",storeId).eq("product_id",productId)
   .eq("updated_at",expected).select("product_id").maybeSingle();
  if(error||!data)return fail("Measurements could not be updated. Refresh and retry.");
 }else{
  const {error}=await client.from("supplier_product_shipping_profiles")
   .insert({...values,store_id:storeId,product_id:productId});
  if(error)return fail("Measurements could not be saved. Refresh and retry.");
 }
 refresh();
 return {ok:true,message:"Packed measurements saved. Future cart quotes now estimate package count. USPS fit and final label cost still require fulfillment verification."};
}
export async function removeProductShippingProfile(_previous:Result,form:FormData):Promise<Result>{
 const session=await access(form);
 if(!session)return fail("An authorized supplier owner or manager must sign in.");
 const expected=form.get("expectedUpdatedAt");
 if(typeof expected!=="string"||expected==="none"||expected.length>80||
  !Number.isFinite(Date.parse(expected)))return fail("Refresh before clearing measurements.");
 const {data,error}=await session.client.from("supplier_product_shipping_profiles")
  .delete().eq("store_id",session.storeId).eq("product_id",session.productId)
  .eq("updated_at",expected).select("product_id").maybeSingle();
 if(error||!data)return fail("Measurements changed or could not be cleared. Refresh and retry.");
 refresh();
 return {ok:true,message:"Measurements cleared. Cart shipping reverts to provisional until new measurements are entered."};
}
