"use client";
import {useActionState} from "react";
import {issueApprovedMediaVersion,revokeApprovedMediaVersion}
 from "./media-version-actions";

export function IssueApprovedMediaVersion({storeId,productId,submissionId,evidenceId}:{
 storeId:string;productId:string;submissionId:string;evidenceId:string;
}){
 const [state,action,pending]=useActionState(issueApprovedMediaVersion,{
  ok:false,message:"",
 });
 return <form action={action} className="apex-admin-media-evidence-form">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <input type="hidden" name="submissionId" value={submissionId}/>
  <input type="hidden" name="evidenceId" value={evidenceId}/>
  <p className="notice"><strong>Verified private image copy</strong>. Only use this after
   independently checking the pictured product and image-use rights. The system
   will copy the exact bytes, verify SHA-256, and record an immutable revision.</p>
  <button type="submit" className="button secondary" disabled={pending}>
   {pending?"Verifying image…":"Create reviewed image version"}
  </button>
  {state.message&&<p role="status" className="notice">{state.message}</p>}
 </form>;
}

export function RevokeMediaVersion({storeId,productId}:{
 storeId:string;productId:string;
}){
 const [state,action,pending]=useActionState(revokeApprovedMediaVersion,{
  ok:false,message:"",
 });
 return <details className="apex-admin-media-checklist">
  <summary>Revoke current image version</summary>
  <form action={action} className="apex-admin-media-evidence-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="productId" value={productId}/>
   <label>Reason for permanent image-version revocation
    <textarea name="note" minLength={10} maxLength={1000} rows={2}
     required disabled={pending} placeholder="Explain the change or withdrawal"/>
   </label>
   <button type="submit" disabled={pending} className="button secondary">
    {pending?"Revoking…":"Revoke most recent version"}
   </button>
   {state.message&&<p role="status" className="notice">{state.message}</p>}
  </form>
 </details>;
}
