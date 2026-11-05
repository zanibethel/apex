"use server";
import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
const fail=(message:string):Result=>({ok:false,message});
const ORIGIN="https://fhqpkpztercadcxspdkg.supabase.co";

async function authorizedRequest(path:"issue"|"revoke",payload:Record<string,string>){
 const client=await createSupplierServerClient();
 if(!client)return fail("Administrator login required.");
 const {data:user,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(user.user))
  return fail("Verified platform administrator access required.");
 const {data:session,error:sessionError}=await client.auth.getSession();
 const token=session.session?.access_token;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(sessionError||!token||url!==ORIGIN||!key||!key.startsWith("sb_publishable_"))
  return fail("Media worker connection is not ready.");
 try{
  const res=await fetch(ORIGIN+"/functions/v1/apex-media-v1/"+path,{
   method:"POST",cache:"no-store",redirect:"manual",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,apikey:key},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(22000),
  });
  if(![200,201].includes(res.status))return fail(
   "This image version was not changed. Verify the latest product review, evidence and authorizations.");
  const body:unknown=await res.json();
  if(!body||typeof body!=="object"||!("ok" in body)||body.ok!==true)
   return fail("The image worker did not confirm the operation.");
  revalidatePath("/admin/media-readiness");
  return {ok:true,message:path==="issue"?
   "Image version recorded after private copy and SHA-256 verification. Public display and checkout remain independently gated.":
   "The latest image version was permanently revoked. A revised image requires new evidence and a new version."};
 }catch{return fail("The media worker could not be reached. Nothing is confirmed. Check status before retrying.");}
}

export async function issueApprovedMediaVersion(_prior:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId"),
 submissionId=form.get("submissionId"),evidenceId=form.get("evidenceId");
 if(!isValidId(storeId)||!isValidId(productId)||
  !isValidId(submissionId)||!isValidId(evidenceId))
  return fail("Invalid product, review, or media-evidence identity.");
 return authorizedRequest("issue",{storeId,productId,submissionId,evidenceId});
}
export async function revokeApprovedMediaVersion(_prior:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId"),note=form.get("note");
 if(!isValidId(storeId)||!isValidId(productId)||typeof note!=="string"||
  note.trim().length<10||note.length>1000)
  return fail("Choose a product and provide a reason of at least 10 characters.");
 return authorizedRequest("revoke",{storeId,productId,note:note.trim()});
}
