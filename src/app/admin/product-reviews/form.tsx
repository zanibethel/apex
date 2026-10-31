"use client";

import {useActionState} from "react";
import {decidePrivateProductReview} from "./actions";

export function ProductReviewDecisionForm({storeId,productId,submissionId}:{
 storeId:string;productId:string;submissionId:string;
}) {
 const [state,action,pending]=useActionState(decidePrivateProductReview,{ok:false,message:""});
 return <form action={action} className="supplier-form apex-admin-review-form">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <input type="hidden" name="submissionId" value={submissionId}/>
  <label htmlFor={"decision-"+productId}>Review decision</label>
  <select name="decision" id={"decision-"+productId} defaultValue="changes_requested" required>
   <option value="changes_requested">Request changes</option>
   <option value="approved_internal">Approve internally (not published)</option>
  </select>
  <label htmlFor={"notes-"+productId}>Review notes</label>
  <textarea id={"notes-"+productId} name="note" maxLength={1000} rows={3}
   placeholder="Required when requesting changes. Explain what the supplier must fix."/>
  <button className="button primary" type="submit" disabled={pending}>
   {pending?"Saving decision…":"Save review decision"}
  </button>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
