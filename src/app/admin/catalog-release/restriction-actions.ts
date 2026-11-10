"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type RestrictionResult={ok:boolean;message:string};
export async function saveAdminProductDisplayRestriction(
 _previous:RestrictionResult,form:FormData,
):Promise<RestrictionResult>{
 const storeId=form.get("storeId"),productId=form.get("productId");
 const action=form.get("action"),reason=form.get("reason");
 if(!isValidId(storeId)||!isValidId(productId)||
   !["restrict","unrestrict"].includes(String(action))||
   typeof reason!=="string"||reason.length>500||
   (action==="restrict"&&reason.trim().length<3))
  return {ok:false,message:"Choose a valid product action and provide a reason when restricting."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin login required."};
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))
  return {ok:false,message:"Verified platform administrator access required."};
 const {data,error:rpcError}=await client.rpc("set_admin_retail_product_restriction",{
  p_store_id:storeId,p_product_id:productId,
  p_restrict:action==="restrict",p_reason:reason.trim(),
 });
 if(rpcError||typeof data!=="string")
  return {ok:false,message:"Could not change the product restriction. Refresh the admin page and try again."};
 for(const path of ["/admin/catalog-release","/admin/listing-controls","/supplier/catalog",
  "/supplier/catalog/bulk","/catalog","/cart"])revalidatePath(path);
 return {ok:true,message:data};
}
