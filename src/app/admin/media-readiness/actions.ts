"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {privateProductMediaPath} from "@/lib/catalog/private-media-readiness.mjs";

type Result={ok:boolean;message:string};
const failed=(message:string):Result=>({ok:false,message});
export async function recordPrivateMediaEvidence(_prior:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId");
 const submissionId=form.get("submissionId"),imagePath=form.get("imagePath");
 const result=form.get("reviewStatus"),identityRef=form.get("identityReference");
 const rightsRef=form.get("rightsReference"),note=form.get("note");
 if(!isValidId(storeId)||!isValidId(productId)||!isValidId(submissionId)||
  typeof imagePath!=="string"||!privateProductMediaPath(storeId,productId,imagePath)||
  (result!=="evidence_recorded"&&result!=="needs_correction")||
  typeof identityRef!=="string"||identityRef.length>300||
  typeof rightsRef!=="string"||rightsRef.length>300||
  typeof note!=="string"||note.trim().length<10||note.length>1000)
  return failed("Check the selected submission and provide a review note (10–1000 characters).");
 if(result==="evidence_recorded"&&
  (identityRef.trim().length<8||rightsRef.trim().length<8))
  return failed("Record specific product-identity and image-use-rights evidence references.");
 const client=await createSupplierServerClient();
 if(!client)return failed("Admin login required.");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))return failed("Verified platform-admin access required.");

 const {data:review,error:reviewError}=await client.from("private_product_review_states")
  .select("store_id,product_id,submission_id,status,snapshot")
  .eq("store_id",storeId).eq("product_id",productId).maybeSingle();
 if(reviewError||!review||review.submission_id!==submissionId||
  !review.snapshot||typeof review.snapshot!=="object"||
  Array.isArray(review.snapshot)||review.snapshot.image_path!==imagePath)
  return failed("The image or product submission changed. Refresh before recording evidence.");
 if(result==="evidence_recorded"&&review.status!=="approved_internal")
  return failed("The product must have a current internal content approval before evidence can be marked reviewed.");

 // The private object must be accessible to a trusted admin. This signed URL
 // is never saved to the database or sent to the public catalog.
 if(result==="evidence_recorded"){
  const check=await client.storage.from("apex-draft-product-images")
   .createSignedUrl(imagePath,45);
  if(check.error||!check.data?.signedUrl)
   return failed("Private image is unavailable. Recheck the upload before recording evidence.");
 }
 const saved=await client.from("private_media_evidence_events").insert({
  store_id:storeId,product_id:productId,submission_id:submissionId,
  image_path:imagePath,review_status:result,
  identity_reference:identityRef.trim(),rights_reference:rightsRef.trim(),
  note:note.trim(),created_by:auth.user.id,
 }).select("id").maybeSingle();
 if(saved.error||!saved.data)
  return failed("Evidence record was not saved. Refresh and verify your access and current image.");
 revalidatePath("/admin/media-readiness");
 revalidatePath("/supplier/catalog/bulk");
 return {ok:true,message:result==="evidence_recorded"
  ?"Evidence references saved privately for this image version. Public approval and checkout remain disabled."
  :"Correction request recorded for this private image. No public approval was granted."};
}
