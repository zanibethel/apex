"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {SUPPLIER_OPTION_BATCH} from "@/lib/catalog/supplier-parent-review-snapshot.mjs";

type Result={ok:boolean;message:string};

// Supplier catalog CONTENT review only. No product publish, stock or checkout API.
export async function saveSupplierParentContentReview(
 _previous:Result,form:FormData,
):Promise<Result>{
 const storeId=form.get("storeId");
 const sourceBatch=form.get("sourceBatch");
 const parentTitle=form.get("parentTitle");
 const decision=form.get("decision");
 const enteredNote=form.get("note");
 const rawSnapshot=form.get("expected");
 if(!isValidId(storeId)||sourceBatch!==SUPPLIER_OPTION_BATCH||
  typeof parentTitle!=="string"||!parentTitle.trim()||
  parentTitle!==parentTitle.trim()||parentTitle.length>120||
  (decision!=="approved"&&decision!=="needs_changes")||
  typeof enteredNote!=="string"||enteredNote.length>500||
  typeof rawSnapshot!=="string"||rawSnapshot.length>18000){
  return {ok:false,message:"Invalid review request. Refresh the product cards."};
 }
 const note=decision==="approved"?"":enteredNote.trim();
 if(decision==="needs_changes"&&note.length<3)
  return {ok:false,message:"Add a short note explaining what needs changing."};
 let snapshot:unknown;
 try{snapshot=JSON.parse(rawSnapshot);}
 catch{return {ok:false,message:"Product data changed. Refresh and try again."};}
 if(!Array.isArray(snapshot)||snapshot.length<1||snapshot.length>100)
  return {ok:false,message:"Product data changed. Refresh and try again."};

 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Sign in to review these products."};
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  return {ok:false,message:"Sign in to review these products."};

 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)
  return {ok:false,message:"Supplier owner or manager access required."};
 const {data:store,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").eq("id",storeId)
  .eq("is_public",false).maybeSingle();
 if(storeError||!store||!memberships.some(m=>m.supplier_id===store.supplier_id))
  return {ok:false,message:"This private supplier store is not assigned to you."};

 // The row-level INSERT policy verifies the caller, and the SECURITY INVOKER
 // trigger re-checks the entire exact current source snapshot and held rows.
 const {error}=await client.from("apex_supplier_parent_review_events").insert({
  store_id:storeId,source_batch:sourceBatch,parent_title:parentTitle,
  decision,note,reviewed_snapshot:snapshot,
 });
 if(error)return {ok:false,message:
  "Review was not saved. Refresh the page and confirm the current options."};
 revalidatePath("/supplier/catalog/variant-review");
 return {ok:true,message:decision==="approved"?
  "Product details approved for private catalog review only.":
  "Changes requested. The original details remain unchanged."};
}
