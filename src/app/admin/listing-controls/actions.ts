"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
export async function saveAdminListingOverride(_previous:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId"),action=form.get("action"),note=form.get("reason");
 if(!isValidId(storeId)||!isValidId(productId)||
   !["hold","require_review","approve_republish"].includes(String(action))||
   typeof note!=="string"||note.length>1000||
   (action!=="approve_republish"&&!note.trim()))
  return {ok:false,message:"Choose a valid admin override with a reason."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin login required."};
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))
  return {ok:false,message:"Verified platform admin access required."};
 const result=await client.rpc("set_admin_listing_override",{
  p_store_id:storeId,p_product_id:productId,p_action:action,p_reason:note,
 });
 if(result.error||!result.data)
  return {ok:false,message:"Override could not be recorded. Refresh and verify the product status."};
 revalidatePath("/admin/listing-controls");
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/catalog/bulk");
 return {ok:true,message:result.data};
}
