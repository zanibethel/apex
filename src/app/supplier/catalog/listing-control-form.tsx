"use client";

import {useActionState} from "react";
import {saveSupplierListingIntent} from "./listing-actions";

export function SupplierListingControls({storeId,productId,canEdit,wantsListing,canRequest,publishLabel="Request publication"}:{
 storeId:string;productId:string;canEdit:boolean;wantsListing:boolean;canRequest:boolean;
 publishLabel?:string;
}) {
 const [state,action,pending]=useActionState(saveSupplierListingIntent,{ok:false,message:""});
 return <form action={action} className="apex-listing-control-form">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <div className="apex-listing-control-buttons">
   <button className="button primary" type="submit" name="action" value="publish"
    disabled={!canEdit||!canRequest||wantsListing||pending}>
     {pending?"Saving…":wantsListing?"Publication requested":publishLabel}
   </button>
   <button className="button secondary" type="submit" name="action" value="unpublish"
    disabled={!canEdit||!wantsListing||pending}>Remove request</button>
  </div>
  <p className="notice">Publication preference only. No product is made publicly visible until separate authorization and public release controls are enabled.</p>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
