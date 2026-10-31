"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
export async function submitProductForInternalReview(_previous:Result,form:FormData):Promise<Result> {
 if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
  return {ok:false,message:"Draft review submissions are not enabled."};
 const storeId=form.get("storeId"),productId=form.get("productId");
 if(!isValidId(storeId)||!isValidId(productId))
  return {ok:false,message:"Invalid draft product."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Sign in to your supplier workspace."};
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  return {ok:false,message:"Sign in to your supplier workspace."};
 const membership=await client.from("supplier_memberships").select("supplier_id,role")
  .in("role",["owner","manager"]).limit(20);
 if(membership.error||!membership.data?.length)
  return {ok:false,message:"Only supplier owners and managers can submit drafts."};
 const store=await client.from("stores").select("id").eq("id",storeId)
  .eq("is_public",false).in("supplier_id",membership.data.map(m=>m.supplier_id)).maybeSingle();
 if(store.error||!store.data)return {ok:false,message:"This private storefront is unavailable."};
 // RPC is authoritative for current eight-step completeness, tenant membership,
 // serialization, state transition and append-only review history.
 const {data,error}=await client.rpc("submit_private_product_review",{
  p_store_id:storeId,p_product_id:productId,
 });
 if(error||!data)return {ok:false,message:"Could not submit. Confirm all eight steps are complete, or refresh the current review status."};
 revalidatePath("/supplier/catalog");
 revalidatePath("/admin/product-reviews");
 return {ok:true,message:"Submitted for internal admin review. Nothing was published."};
}
