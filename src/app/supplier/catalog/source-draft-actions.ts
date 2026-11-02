"use server";

import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {chooseNewSku} from "@/lib/catalog/sku.mjs";
import {proposedSoldOutPricing} from "@/lib/catalog/sold-out-import-pricing.mjs";
import {privateSourceDraftDescription} from "@/lib/catalog/private-source-draft-description.mjs";

type ItemResult={candidateId:string;ok:boolean;message:string};
type Result={ok:boolean;message:string;results:ItemResult[]};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied:Result={ok:false,message:"Supplier owner/manager access required for a private storefront.",results:[]};

export async function createPrivateSourceCards(form:FormData):Promise<Result>{
 if(process.env.APEX_PRIVATE_SOURCE_DRAFTS_ENABLED!=="true"||
    process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
  return {ok:false,message:"Private source import is not enabled yet.",results:[]};
 const storeId=form.get("storeId"),raw=form.get("candidateIds");
 if(typeof storeId!=="string"||!UUID.test(storeId)||typeof raw!=="string"||raw.length>1000)
  return {ok:false,message:"Invalid private import selection.",results:[]};
 let parsed:unknown;
 try{parsed=JSON.parse(raw)}catch{return {ok:false,message:"Invalid source IDs.",results:[]}}
 if(!Array.isArray(parsed)||parsed.length<1||parsed.length>10||
    parsed.some(id=>typeof id!=="string"||!UUID.test(id))||
    new Set(parsed).size!==parsed.length)
  return {ok:false,message:"Select 1–10 distinct private sources.",results:[]};
 const ids=parsed as string[];
 const workspace=await getSupplierWorkspace();
 if(!workspace||!workspace.stores.some(s=>s.id===storeId&&!s.is_public&&
  workspace.memberships.some(m=>m.supplier_id===s.supplier_id&&
   ["owner","manager"].includes(m.role))))return denied;
 const [sources,existing]=await Promise.all([
  workspace.client.from("supplier_import_candidates")
   .select("id,store_id,product_name,strength,wholesale_cost_cents,review_status")
   .eq("store_id",storeId).in("id",ids).limit(10),
  workspace.client.from("supplier_candidate_drafts")
   .select("candidate_id").eq("store_id",storeId).in("candidate_id",ids).limit(10),
 ]);
 if(sources.error||existing.error||sources.data?.length!==ids.length)
  return {ok:false,message:"Unable to verify all private source records. No cards created.",results:[]};
 const mapped=new Set((existing.data??[]).map(item=>item.candidate_id));
 if(ids.some(id=>mapped.has(id)))
  return {ok:false,message:"One or more sources already have private cards. Refresh and retry.",results:[]};
 const byId=new Map((sources.data??[]).map(item=>[item.id,item]));
 const plans=ids.map(id=>{
  const source=byId.get(id);
  const prices=proposedSoldOutPricing(source?.wholesale_cost_cents);
  const title=source?[source.product_name,source.strength].map(s=>s?.trim()).join(" — "):"";
  const description=source?privateSourceDraftDescription(source.product_name,source.strength):null;
  return {id,source,prices,title,description};
 });
 if(plans.some(p=>!p.source||!p.prices||!p.description||p.title.length>120))
  return {ok:false,message:"An imported item needs a valid source name or cost before a draft can be created.",results:[]};
 const results:ItemResult[]=[];
 for(const plan of plans){
  if(!plan.source||!plan.prices||!plan.description)continue;
  // Server creates the SKU, rechecks expected source cost inside an invoker
  // transaction, and links the original row. No approval status is changed.
  const sku=chooseNewSku("",plan.title);
  if(!sku){results.push({candidateId:plan.id,ok:false,message:"Unable to assign SKU."});break;}
  const {data,error}=await workspace.client.rpc("create_private_draft_from_source",{
   p_store_id:storeId,p_candidate_id:plan.id,p_sku:sku,
   p_description:plan.description,
   p_expected_cost_cents:plan.prices.sourceCostCents,
  });
  results.push({candidateId:plan.id,ok:!error&&typeof data==="string"&&UUID.test(data),
   message:error?"Failed: record changed or was already imported. Refresh and retry.":"Private zero-stock card saved."});
  if(error)break; // Stop on mismatch; never silently skip further imports.
 }
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/imports");
 revalidatePath("/supplier/imports/bulk-review");
 revalidatePath("/supplier/inventory");
 const count=results.filter(r=>r.ok).length;
 return {ok:count===ids.length,message:`${count}/${ids.length} private cards created. Nothing was approved, published or made purchasable.`,results};
}
