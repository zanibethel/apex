"use server";

import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {
 parseSupplierTrackingDraftRequest,parseSupplierTrackingDraftReceipt,
} from "@/lib/supplier/review-tracking-draft-contract.mjs";

export type TrackingDraftActionState={
 kind:"idle"|"invalid"|"unavailable"|"saved"|"replay"|"stale"|"conflict";
 message:string;
 expectedRevision?:number;
 observedRevision?:number;
 latestCarrier?:string|null;
 latestTracking?:string|null;
};
const denied:TrackingDraftActionState={
 kind:"unavailable",
 message:"Tracking draft entry is unavailable. No shipment or label was created.",
};
export async function saveSupplierReviewTrackingDraft(
 _previous:TrackingDraftActionState,
 form:FormData,
):Promise<TrackingDraftActionState>{
 const revisionRaw=form.get("expectedRevision");
 if(typeof revisionRaw!=="string"||!/^[1-9]\d{0,2}$/.test(revisionRaw)){
  return {kind:"invalid",message:"Invalid shipment revision. Refresh the queue."};
 }
 const input=parseSupplierTrackingDraftRequest({
  storeId:form.get("storeId"),
  shipmentId:form.get("shipmentId"),
  requestId:form.get("requestId"),
  expectedRevision:Number(revisionRaw),
  carrier:form.get("carrier"),
  trackingReference:form.get("trackingReference"),
 });
 if(!input)return {kind:"invalid",
  message:"Enter a valid carrier and tracking draft. No changes were saved."};
 const w=await getSupplierWorkspace();
 if(!w)return denied;
 const store=w.stores.find(s=>s.id===input.storeId);
 if(!store||!w.memberships.some(m=>
  m.supplier_id===store.supplier_id&&
  (m.role==="owner"||m.role==="manager")))return denied;

 // The RPC is deliberately only installed in apex_test. It independently
 // checks membership, canonical shipment binding, gate and row revision.
 // Absent on production DB => fail closed. Do not use service-role credentials.
 const {data,error}=await w.client.rpc(
  "submit_supplier_review_tracking_draft",{
   p_store_id:input.storeId,
   p_shipment_id:input.shipmentId,
   p_request_id:input.requestId,
   p_expected_revision:input.expectedRevision,
   p_carrier:input.carrier,
   p_tracking_reference:input.trackingReference,
  });
 if(error)return denied;
 const receipt=parseSupplierTrackingDraftReceipt(
  data,input.expectedRevision);
 if(!receipt)return denied;
 const common={
  expectedRevision:receipt.expectedRevision,
  observedRevision:receipt.observedRevision,
  latestCarrier:receipt.latestCarrier,
  latestTracking:receipt.latestTracking,
 };
 if(receipt.kind==="draft_saved"||receipt.kind==="identical_replay"){
  revalidatePath("/supplier/fulfillment");
  return {kind:receipt.kind==="draft_saved"?"saved":"replay",
   message:receipt.kind==="draft_saved"?
    "Tracking draft saved. This does not mark anything shipped. Refresh the queue before editing again.":
    "The same draft was already recorded. No duplicate was created.",
   ...common};
 }
 if(receipt.kind==="stale_version")
  return {kind:"stale",message:
   "Shipment was updated since you opened this form. Your draft was not saved. Compare the latest tracking draft and refresh before retrying.",
   ...common};
 return {kind:"conflict",message:
  "The request ID or tracking reference conflicts with an existing draft. No change was saved. Refresh and review the latest entry.",
  ...common};
}
