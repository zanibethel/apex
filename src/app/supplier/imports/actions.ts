"use server";

import { revalidatePath } from "next/cache";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import { chooseNewSku, normalizeSku } from "@/lib/catalog/sku.mjs";

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

export type DraftPromotionResult = { ok:boolean; message:string };

export async function createDraftFromReviewedVariant(
  _previous:DraftPromotionResult, form:FormData,
):Promise<DraftPromotionResult> {
  if (process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED !== "true") {
    return {ok:false,message:"Draft creation is disabled outside the protected preview."};
  }
  const storeId=form.get("storeId"), candidateId=form.get("candidateId"), skuInput=form.get("sku"),
    price=form.get("retailPrice"), compareRaw=form.get("comparePrice"), stock=form.get("confirmedStock"),
    confirmedPrice=form.get("confirmedPrice"), stockVerified=form.get("stockVerified"),
    description=form.get("description");

  if (typeof storeId!=="string" || !uuid.test(storeId) ||
      typeof candidateId!=="string" || !uuid.test(candidateId) ||
      typeof skuInput!=="string" || (skuInput!=="" && !normalizeSku(skuInput)) ||
      typeof price!=="string" || !/^\d{1,7}(\.\d{1,2})?$/.test(price) ||
      typeof compareRaw!=="string" ||
      (compareRaw!=="" && !/^\d{1,7}(\.\d{1,2})?$/.test(compareRaw)) ||
      typeof stock!=="string" || !/^(0|[1-9]\d{0,6})$/.test(stock) ||
      confirmedPrice!=="on" || (Number(stock)>0 && stockVerified!=="on") ||
      typeof description!=="string" || description.length>1500) {
    return {ok:false,message:"Enter an optional valid SKU, an approved retail price and a confirmed stock quantity. Check the required confirmations."};
  }

  const [whole,cents=""]=price.split(".");
  const retailCents=Number(whole)*100+Number(cents.padEnd(2,"0"));
  const compareCents=compareRaw===""?null:(()=>{
    const [cWhole,cFraction=""]=compareRaw.split(".");
    return Number(cWhole)*100+Number(cFraction.padEnd(2,"0"));
  })();
  const quantity=Number(stock);
  if (!Number.isSafeInteger(retailCents) || retailCents<1 || retailCents>999999999 ||
      !Number.isSafeInteger(quantity) || quantity>1000000 ||
      (compareCents!==null && (!Number.isSafeInteger(compareCents) ||
       compareCents<=retailCents || compareCents>999999999))) {
    return {ok:false,message:"Retail price or quantity is outside the allowed range."};
  }

  const w=await getSupplierWorkspace();
  if(!w || !w.stores.some(s=>s.id===storeId && !s.is_public &&
    w.memberships.some(m=>m.supplier_id===s.supplier_id && ["owner","manager"].includes(m.role)))) {
    return {ok:false,message:"Supplier access required."};
  }

  const {data:candidate,error:candidateError}=skuInput===""
    ?await w.client.from("supplier_import_candidates")
      .select("product_name,strength").eq("store_id",storeId).eq("id",candidateId).maybeSingle()
    :{data:null,error:null};
  if(skuInput==="" && (candidateError||!candidate))
    return {ok:false,message:"Source variant unavailable for automatic SKU generation."};
  const sku=skuInput===""
    ?chooseNewSku("",`${candidate?.product_name??""} ${candidate?.strength??""}`)
    :normalizeSku(skuInput);
  if(!sku) return {ok:false,message:"Invalid SKU."};

  // SECURITY INVOKER RPC executes source-status verification, insert, stock creation
  // and one-to-one source association in a single RLS-scoped DB transaction.
  const {data,error}=await w.client.rpc("create_draft_from_candidate_with_compare",{
    p_store_id:storeId,
    p_candidate_id:candidateId,
    p_sku:sku,
    p_retail_price_cents:retailCents,
    p_quantity_on_hand:quantity,
    p_description:description.trim(),
    p_compare_at_price_cents:compareCents,
  });
  if(error || !data) {
    return {ok:false,message:"Draft not created. Check review approval, SKU uniqueness, and whether this variant was already imported."};
  }

  revalidatePath("/supplier/imports");
  revalidatePath("/supplier/catalog");
  revalidatePath("/supplier/inventory");
  revalidatePath("/supplier");
  return {ok:true,message:"Private draft created with the retail price and stock you entered. It is not published."};
}
