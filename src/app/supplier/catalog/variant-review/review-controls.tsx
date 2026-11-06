"use client";

import {useActionState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {saveSupplierParentContentReview} from "./review-actions";

export function SupplierParentReviewControls({storeId,sourceBatch,parentTitle,
 snapshotJson,canApprove,status}:{
 storeId:string;sourceBatch:string;parentTitle:string;
 snapshotJson:string;canApprove:boolean;status:string;
}){
 const router=useRouter();
 const [state,action,pending]=useActionState(saveSupplierParentContentReview,{
  ok:false,message:"",
 });
 useEffect(()=>{if(state.ok)router.refresh();},[state.ok,router]);
 return <form action={action} className="apex-variant-review-panel"
  aria-label={"Review "+parentTitle}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="sourceBatch" value={sourceBatch}/>
  <input type="hidden" name="parentTitle" value={parentTitle}/>
  <input type="hidden" name="expected" value={snapshotJson}/>
  <p className="notice">Catalog content review: <strong>{status}</strong></p>
  {!canApprove&&<p className="notice">
   This product needs supplier clarification before approval.
  </p>}
  <label>
   <span>Correction note (only for Needs Changes)</span>
   <textarea name="note" maxLength={500} rows={2}
    placeholder="What needs to be corrected?"/>
  </label>
  <div className="apex-variant-review-actions">
   <button type="submit" name="decision" value="approved"
    className="button primary" disabled={!canApprove||pending}>
    {pending?"Saving…":"Approve"}
   </button>
   <button type="submit" name="decision" value="needs_changes"
    className="button secondary" disabled={pending}>
    Needs Changes
   </button>
  </div>
  {state.message&&<p role="status">{state.message}</p>}
  <p className="notice">Approves data accuracy only. Does not publish,
   change stock, or activate checkout.</p>
 </form>;
}
