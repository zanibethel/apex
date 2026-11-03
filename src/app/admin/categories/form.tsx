"use client";
import {useActionState} from "react";
import {updateAdminCategoryPublication} from "./actions";

export function AdminCategoryPublicationForm({storeId,categoryId,published}:{
 storeId:string;categoryId:string;published:boolean;
}){
 const [state,action,pending]=useActionState(updateAdminCategoryPublication,
  {ok:false,message:""});
 return <form action={action} className="supplier-form"
  style={{gap:8,maxWidth:"none",marginTop:12}}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="categoryId" value={categoryId}/>
  {!published&&<label htmlFor={"cat-reason-"+categoryId}>
   Publication note
   <textarea name="reason" id={"cat-reason-"+categoryId}
    maxLength={600} minLength={3} rows={2}
    required disabled={pending}
    placeholder="Briefly record the category review decision."/>
  </label>}
  {published&&<input type="hidden" name="reason" value=""/>}
  <button type="submit" name="action"
   value={published?"unpublish":"publish"} disabled={pending}
   className={published?"button secondary":"button primary"}>
   {pending?"Saving…":published?"Unpublish category":"Publish category"}
  </button>
  {state.message&&<p className="notice" role="status">{state.message}</p>}
 </form>;
}
