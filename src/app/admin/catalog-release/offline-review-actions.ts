"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
export async function saveAdminOfflineProductReview(
 _previous:Result,form:FormData,
):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId");
 const status=form.get("status"),reference=form.get("reference");
 const note=form.get("note"),expires=form.get("validUntil");
 if(!isValidId(storeId)||!isValidId(productId)||
   !["approved","follow_up","revoked"].includes(String(status))||
   typeof reference!=="string"||reference.length>200||
   typeof note!=="string"||note.length>1000||
   typeof expires!=="string"||
   (status==="approved"&&reference.trim().length<3)||
   (status==="follow_up"&&note.trim().length<3)||
   (expires!==""&&!/^\d{4}-\d{2}-\d{2}$/.test(expires)))
  return {ok:false,message:"Select a decision and provide the required review reference or follow-up note."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin login required."};
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))
  return {ok:false,message:"Verified platform administrator access required."};
 const {data,error:rpcError}=await client.rpc("set_admin_offline_product_review",{
  p_store_id:storeId,p_product_id:productId,p_status:status,
  p_evidence_reference:reference.trim(),p_review_note:note.trim(),
  p_valid_until:status==="approved"&&expires!==""?expires:null,
 });
 if(rpcError||typeof data!=="string")
  return {ok:false,message:"Could not record the review. Refresh and verify the product and reference."};
 revalidatePath("/admin/catalog-release");
 return {ok:true,message:data};
}
