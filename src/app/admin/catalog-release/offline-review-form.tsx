"use client";

import {useActionState,useState} from "react";
import {saveAdminOfflineProductReview} from "./offline-review-actions";

export type OfflineReviewRecord={
 status:"approved"|"follow_up"|"revoked";
 evidence_reference:string;review_note:string;
 reviewed_at:string;valid_until:string|null;
 current_product:boolean;expired:boolean;
};
export function AdminOfflineProductReviewForm({
 storeId,productId,record,
}:{storeId:string;productId:string;record?:OfflineReviewRecord}){
 const [status,setStatus]=useState<OfflineReviewRecord["status"]>(record?.status??"approved");
 const [state,action,pending]=useActionState(saveAdminOfflineProductReview,
  {ok:false,message:""});
 const valid=Boolean(record?.status==="approved"&&record.current_product&&!record.expired);
 return <details className="apex-card-editor">
  <summary>External review: {valid?"Approved":record?.status==="approved"
   ?"Recheck required":record?.status==="follow_up"?"Follow-up needed":
   record?.status==="revoked"?"Revoked":"Not recorded"} · Manage</summary>
  <p className="notice">Record the outcome of a review completed outside Apex. This is an
   administrative record only; it does not bypass product listing restrictions,
   activate checkout, or establish legal authorization by itself.</p>
  {record&&<p className="notice">Last decision: {record.status.replace("_"," ")}
   {record.current_product?"":" · Product details changed since review"}
   {record.expired?" · Reference expired":""}
   {record.valid_until?" · Valid until "+record.valid_until:""}</p>}
  <form action={action} className="supplier-form" style={{gap:8}}>
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="productId" value={productId}/>
   <label>Admin review decision
    <select name="status" value={status}
     onChange={e=>setStatus(e.currentTarget.value as OfflineReviewRecord["status"])}
     disabled={pending}>
     <option value="approved">Approve off-platform review</option>
     <option value="follow_up">Needs follow-up</option>
     <option value="revoked">Revoke recorded approval</option>
    </select>
   </label>
   <label>Evidence reference (internal reference, not customer data)
    <input name="reference" maxLength={200} required={status==="approved"}
     defaultValue={record?.evidence_reference??""} disabled={pending}
     placeholder="Verified document or case reference"/>
   </label>
   {status==="approved"&&<label>Review expiration (optional)
    <input type="date" name="validUntil" defaultValue={record?.valid_until??""}
     disabled={pending}/>
   </label>}
   <label>Review note {status==="follow_up"?"(required)":""}
    <textarea name="note" rows={2} maxLength={1000}
     required={status==="follow_up"} disabled={pending}
     defaultValue={record?.review_note??""}
     placeholder="Review outcome; avoid sensitive customer information"/>
   </label>
   <button type="submit" className="button secondary" disabled={pending}>
    {pending?"Saving…":"Save review decision"}
   </button>
   {state.message&&<p role="status" className="notice">{state.message}</p>}
  </form>
 </details>;
}
