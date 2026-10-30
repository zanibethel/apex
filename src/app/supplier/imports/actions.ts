"use server";

import { revalidatePath } from "next/cache";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";

export type ReviewResult = { ok:boolean;message:string };
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states=["unverified","under_review","approved_for_draft","hold"] as const;

export async function reviewImportCandidate(_previous:ReviewResult,form:FormData):Promise<ReviewResult> {
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
    return {ok:false,message:"Import review changes are not enabled here."};
  const storeId=form.get("storeId"),candidateId=form.get("candidateId"),status=form.get("reviewStatus");
  if(typeof storeId!=="string"||!uuid.test(storeId)||typeof candidateId!=="string"||
    !uuid.test(candidateId)||typeof status!=="string"||!states.some(s=>s===status))
    return {ok:false,message:"Invalid review update."};
  const w=await getSupplierWorkspace();
  if(!w || !w.stores.some(s=>s.id===storeId && !s.is_public &&
     w.memberships.some(m=>m.supplier_id===s.supplier_id && ["owner","manager"].includes(m.role))))
    return {ok:false,message:"Supplier access required."};

  const {data,error}=await w.client.from("supplier_import_candidates")
    .update({review_status:status}).eq("store_id",storeId).eq("id",candidateId)
    .select("id").maybeSingle();
  if(error||!data) return {ok:false,message:"Review not saved. Check the current record."};
  revalidatePath("/supplier/imports");
  return {ok:true,message:"Review status updated and audited. This is not a published product."};
}
