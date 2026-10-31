"use client";

import {useActionState} from "react";
import {submitProductForInternalReview} from "./review-actions";

export function SupplierReviewSubmission({storeId,productId,enabled}:{
 storeId:string;productId:string;enabled:boolean;
}) {
 const [state,action,pending]=useActionState(submitProductForInternalReview,{ok:false,message:""});
 return <form action={action} className="apex-review-submit">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <button type="submit" className="button primary" disabled={!enabled||pending}>
   {pending?"Submitting…":"Submit for internal review"}
  </button>
  <p className="notice">This requests a private admin content review only. It never publishes a product.</p>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
