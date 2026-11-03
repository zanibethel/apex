"use client";

import {useActionState} from "react";
import {saveSupplierListingIntent} from "./listing-actions";

export function SupplierListingControls({storeId,productId,canEdit,wantsListing,canRequest,publishLabel="Publish"}:{
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
     {pending?"Saving…":wantsListing?"Publish enabled":publishLabel}
   </button>
   <button className="button secondary" type="submit" name="action" value="unpublish"
    disabled={!canEdit||!wantsListing||pending}>Unpublish</button>
  </div>
  <p className="notice">Publish saves your storefront preference. The public listing becomes visible only when its release checks are satisfied. An administrator can still apply a hold.</p>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
