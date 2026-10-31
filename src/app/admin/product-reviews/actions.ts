"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
export async function decidePrivateProductReview(_previous:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId"),submissionId=form.get("submissionId");
 const decision=form.get("decision"),note=form.get("note");
 if(!isValidId(storeId)||!isValidId(productId)||!isValidId(submissionId)||
    (decision!=="approved_internal"&&decision!=="changes_requested")||
    typeof note!=="string"||note.length>1000||
    (decision==="changes_requested"&&!note.trim()))
  return {ok:false,message:"Choose a valid review decision and explain requested changes."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin login required."};
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))
  return {ok:false,message:"Verified platform administrator access required."};
 // Database RPC validates the platform-admin JWT, submission ID, draft state,
 // and unchanged product content; it also writes an immutable history event.
 const result=await client.rpc("decide_private_product_review",{
  p_store_id:storeId,p_product_id:productId,
  p_submission_id:submissionId,p_decision:decision,p_note:note,
 });
 if(result.error||!result.data)
  return {ok:false,message:"Review could not be saved. Refresh; the draft or submission may have changed."};
 revalidatePath("/admin/product-reviews");
 revalidatePath("/supplier/catalog");
 return {ok:true,message:decision==="approved_internal"
  ?"Approved for internal catalog review only. Storefront remains unpublished."
  :"Changes requested. The supplier can update and resubmit the private draft."};
}
