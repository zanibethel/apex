"use server";

import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {sourceReviewSummary,validateSourceReviewBatch} from "@/lib/catalog/bulk-source-review.mjs";

export type BulkReviewOutcome={id:string;ok:boolean;message:string};
export type BulkReviewResult={ok:boolean;message:string;results:BulkReviewOutcome[]};
const refused:BulkReviewResult={ok:false,
 message:"Only a signed-in supplier owner or manager of a private storefront may review imports.",results:[]};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateBulkSourceReviews(
 _previous:BulkReviewResult,form:FormData,
):Promise<BulkReviewResult>{
 if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
  return {ok:false,message:"Supplier review changes are disabled.",results:[]};
 const storeId=form.get("storeId"),raw=form.get("batch");
 if(typeof storeId!=="string"||!UUID.test(storeId)||
    typeof raw!=="string"||raw.length>3500)
  return {ok:false,message:"Invalid bulk review submission.",results:[]};
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{
  return {ok:false,message:"Invalid review selection.",results:[]};
 }
 const batch=validateSourceReviewBatch(parsed);
 if(!batch)return {ok:false,message:"Choose 1–20 unique records and verify every approval.",results:[]};
 if(batch.action==="approved_for_draft"&&form.get("verifiedSourceRecords")!=="yes")
  return {ok:false,message:"Confirm each source record and the required supplier verification before approving.",results:[]};

 const workspace=await getSupplierWorkspace();
 if(!workspace||!workspace.stores.some(s=>s.id===storeId&&!s.is_public&&
  workspace.memberships.some(m=>m.supplier_id===s.supplier_id&&
   ["owner","manager"].includes(m.role))))return refused;

 const ids=batch.rows.map(row=>row.id);
 const [sources,mappings]=await Promise.all([
  workspace.client.from("supplier_import_candidates")
   .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status")
   .eq("store_id",storeId).in("id",ids).limit(20),
  workspace.client.from("supplier_candidate_drafts")
   .select("candidate_id").eq("store_id",storeId).in("candidate_id",ids).limit(20),
 ]);
 if(sources.error||mappings.error||sources.data?.length!==ids.length)
  return {ok:false,message:"Could not verify all selected source records or existing drafts. Nothing changed.",results:[]};

 const found=new Map((sources.data??[]).map(row=>[row.id,row]));
 const linked=new Set((mappings.data??[]).map(row=>row.candidate_id));
 // Validate the *whole* batch before writing any row. Row status, cost and
 // source link are also included as optimistic conditions on each UPDATE.
 for(const selected of batch.rows){
  const current=found.get(selected.id);
  const summary=sourceReviewSummary(current,linked.has(selected.id));
  if(!summary||summary.linked||summary.status!==selected.status||
    summary.costCents!==selected.costCents||
    (batch.action==="approved_for_draft"&&!summary.validForDraft)){
   return {ok:false,message:"An item was changed, already drafted, or lacks valid source details. Refresh and review again; nothing changed.",results:[]};
  }
 }
 const results:BulkReviewOutcome[]=[];
 for(const selected of batch.rows){
  if(selected.status===batch.action){
   results.push({id:selected.id,ok:true,message:"Already has the selected review status; no change."});
   continue;
  }
  const {data,error}=await workspace.client.from("supplier_import_candidates")
   .update({review_status:batch.action})
   .eq("store_id",storeId)
   .eq("id",selected.id)
   .eq("review_status",selected.status)
   .eq("wholesale_cost_cents",selected.costCents)
   .select("id").maybeSingle();
  results.push({id:selected.id,ok:!error&&Boolean(data),
   message:error||!data?"Not saved; this source may have changed. Refresh and retry.":"Review status recorded in the supplier audit."});
 }
 const changed=results.filter(r=>r.ok).length;
 revalidatePath("/supplier/imports");
 revalidatePath("/supplier/imports/bulk-review");
 revalidatePath("/supplier/imports/bulk-drafts");
 revalidatePath("/supplier/imports/sold-out-preview");
 return {
  ok:changed===results.length,
  message:`${changed}/${results.length} reviewed source entries confirmed. This does not publish products or authorize purchases.`,
  results,
 };
}
