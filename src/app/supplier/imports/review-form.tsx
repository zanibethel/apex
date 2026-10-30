"use client";

import { useActionState, useId } from "react";
import { reviewImportCandidate } from "./actions";

export function ImportReviewForm({storeId,candidateId,status,enabled}:{
 storeId:string;candidateId:string;status:string;enabled:boolean;
}) {
 const [state,action,pending]=useActionState(reviewImportCandidate,{ok:false,message:""});
 const id=useId();
 return <form action={action} className="supplier-form" style={{marginTop:0}}>
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="candidateId" value={candidateId}/>
   <label htmlFor={id}>Review status</label>
   <select id={id} name="reviewStatus" defaultValue={status} disabled={!enabled}>
     <option value="unverified">Unverified</option>
     <option value="under_review">Under review</option>
     <option value="approved_for_draft">Ready for draft product</option>
     <option value="hold">Hold</option>
   </select>
   <button type="submit" className="button secondary" disabled={!enabled||pending}>
     {pending?"Saving…":"Save review"}
   </button>
   {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
