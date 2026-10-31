"use client";

import {useActionState} from "react";
import {saveAdminListingOverride} from "./actions";

export function AdminListingOverrideForm({storeId,productId,gate}:{
 storeId:string;productId:string;gate:string;
}) {
 const [state,action,pending]=useActionState(saveAdminListingOverride,{ok:false,message:""});
 return <form action={action} className="supplier-form apex-listing-override-form">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <label htmlFor={"listing-note-"+productId}>Reason for supplier (required for hold/review)</label>
  <textarea id={"listing-note-"+productId} name="reason" maxLength={1000} rows={3}
   placeholder="Explain the hold or required changes. This note is visible to the supplier."/>
  <p className="notice">Hold and review reasons are shown to the assigned supplier owner or manager. Avoid confidential internal notes.</p>
  <div className="apex-listing-control-buttons">
   <button type="submit" className="button secondary" name="action" value="hold"
    disabled={pending}>Place on hold</button>
   <button type="submit" className="button secondary" name="action" value="require_review"
    disabled={pending}>Require review</button>
   <button type="submit" className="button primary" name="action" value="approve_republish"
    disabled={pending||gate==="clear"}>Approve republishing</button>
  </div>
  <p className="notice">Approving a release removes the admin restriction but never publishes automatically. The supplier must request publication again.</p>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
