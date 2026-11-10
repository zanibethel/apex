"use client";

import {useActionState} from "react";
import {saveAdminProductDisplayRestriction} from "./restriction-actions";

export function AdminProductDisplayRestrictionForm({
 storeId,productId,restricted,
}:{
 storeId:string;productId:string;restricted:boolean;
}){
 const [state,action,pending]=useActionState(
  saveAdminProductDisplayRestriction,{ok:false,message:""});
 const fieldId="retail-restrict-reason-"+productId;
 return <form action={action} className="supplier-form"
  style={{gap:8,marginTop:12,maxWidth:"none"}}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  {!restricted&&<label htmlFor={fieldId}>Reason for restricting retail display
    <textarea id={fieldId} name="reason" required minLength={3} maxLength={500}
      rows={2} disabled={pending} placeholder="Why should this product be hidden from the retail showcase?"/>
   </label>}
  {restricted&&<input type="hidden" name="reason" value="Admin removed visibility restriction"/>}
  <button type="submit" name="action" value={restricted?"unrestrict":"restrict"}
    disabled={pending} className={restricted?"button primary":"button secondary"}>
    {pending?"Saving…":restricted?"Remove restriction":"Restrict display"}
  </button>
  {state.message&&<p role="status" className="notice">{state.message}</p>}
 </form>;
}
