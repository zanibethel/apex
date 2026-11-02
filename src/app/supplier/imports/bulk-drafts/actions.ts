"use server";

import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {chooseNewSku} from "@/lib/catalog/sku.mjs";
import {reviewedImportDraftPlan,validateReviewedDraftSelection} from "@/lib/catalog/reviewed-import-draft-batch.mjs";

export type BatchDraftResult={
 ok:boolean;message:string;
 results:{candidateId:string;created:boolean;productId?:string;message:string}[];
};
const denied:BatchDraftResult={ok:false,message:"Authenticated supplier owner or manager access required.",results:[]};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createReviewedImportDraftBatch(
 _previous:BatchDraftResult,form:FormData,
):Promise<BatchDraftResult>{
 if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")return {
  ok:false,message:"Draft product writes are disabled.",results:[],
 };
 const storeId=form.get("storeId"),raw=form.get("candidateIds");
 if(typeof storeId!=="string"||!UUID.test(storeId)||
  typeof raw!=="string"||raw.length>1000||
  form.get("reviewConfirmed")!=="yes")return {
    ok:false,message:"Select reviewed entries and confirm private draft creation.",results:[],
   };
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{return {ok:false,message:"Invalid selection.",results:[]};}
 const ids=validateReviewedDraftSelection(parsed);
 if(!ids)return {ok:false,message:"Choose between 1 and 10 unique reviewed entries.",results:[]};
 const w=await getSupplierWorkspace();
 if(!w||!w.stores.some(s=>s.id===storeId&&!s.is_public&&
  w.memberships.some(m=>m.supplier_id===s.supplier_id&&
    ["owner","manager"].includes(m.role))))return denied;
 // Never trust browser cost, price, stock, review state, description or SKU.
 const [source,mappings]=await Promise.all([
  w.client.from("supplier_import_candidates")
   .select("id,store_id,source_index,product_name,strength,review_status,wholesale_cost_cents")
   .eq("store_id",storeId).in("id",ids).limit(10),
  w.client.from("supplier_candidate_drafts")
   .select("candidate_id").eq("store_id",storeId).in("candidate_id",ids).limit(10),
 ]);
 if(source.error||mappings.error||source.data?.length!==ids.length){
  return {ok:false,message:"Source rows or existing draft links could not be verified. Nothing was created.",results:[]};
 }
 const byId=new Map((source.data??[]).map(row=>[row.id,row]));
 const linked=new Set((mappings.data??[]).map(row=>row.candidate_id));
 const plans=ids.map(id=>reviewedImportDraftPlan(byId.get(id),linked.has(id)));
 if(plans.some(plan=>!plan||plan.status!=="ready")){
  return {ok:false,message:"At least one selected variant is unreviewed, already saved or invalid. Nothing was created.",results:[]};
 }
 const results:BatchDraftResult["results"]=[];
 for(const plan of plans){
  if(!plan||plan.status!=="ready"||plan.salePriceCents===null||
     plan.proposedCompareAtCents===null||!plan.description){
    results.push({candidateId:plan?.candidateId??"",created:false,message:"Invalid candidate."});
    continue;
  }
  // Confirm the source status and cost again before each atomic, RLS-enforced
  // database draft+inventory+source association transaction.
  const {data:current,error:recheckError}=await w.client.from("supplier_import_candidates")
   .select("id,product_name,strength,review_status,wholesale_cost_cents")
   .eq("store_id",storeId).eq("id",plan.candidateId).maybeSingle();
  const checked=reviewedImportDraftPlan(current,false);
  if(recheckError||!checked||checked.status!=="ready"||
    checked.sourceCostCents!==plan.sourceCostCents||
    checked.description!==plan.description){
    results.push({candidateId:plan.candidateId,created:false,message:"Source was changed or review is no longer valid."});
    continue;
  }
  const sku=chooseNewSku("",checked.name);
  if(!sku){
   results.push({candidateId:plan.candidateId,created:false,message:"Could not prepare a valid SKU."});
   continue;
  }
  const {data:created,error:saveError}=await w.client.rpc("create_draft_from_candidate_with_compare",{
   p_store_id:storeId,
   p_candidate_id:plan.candidateId,
   p_sku:sku,
   p_retail_price_cents:plan.salePriceCents,
   p_compare_at_price_cents:plan.proposedCompareAtCents,
   p_quantity_on_hand:0,
   p_description:plan.description,
  });
  if(saveError||typeof created!=="string"||!UUID.test(created)){
   results.push({candidateId:plan.candidateId,created:false,
    message:"Draft was not confirmed; recheck its source status or duplicate SKU before retry."});
   continue;
  }
  // Source-cost is a private accounting field, not the client retail price.
  // The source candidate remains linked even if this supplemental update fails.
  const {data:costSaved,error:costError}=await w.client.from("products")
   .update({internal_source_cost_cents:plan.sourceCostCents})
   .eq("store_id",storeId).eq("id",created).eq("is_published",false)
   .is("internal_source_cost_cents",null).select("id").maybeSingle();
  results.push({candidateId:plan.candidateId,created:true,productId:created,
   message:costError||!costSaved
    ?"Private draft saved at zero stock. Verify the internal source-cost field in the editor."
    :"Private zero-stock draft saved with source cost and proposed prices."});
 }
 revalidatePath("/supplier/imports");
 revalidatePath("/supplier/imports/bulk-drafts");
 revalidatePath("/supplier/imports/sold-out-preview");
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/supplier/inventory");
 const successes=results.filter(x=>x.created).length;
 return {ok:successes===ids.length,
  message:`${successes}/${ids.length} reviewed variants created as private zero-stock drafts. Nothing published or made purchasable.`,
  results};
}
