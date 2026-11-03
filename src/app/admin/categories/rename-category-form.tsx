"use client";
import {useActionState} from "react";
import {renameAdminCategory} from "./actions";

export function RenameAdminCategoryForm({storeId,categoryId,currentName,published}:{
 storeId:string;categoryId:string;currentName:string;published:boolean;
}){
 const [state,submit,pending]=useActionState(renameAdminCategory,
  {ok:false,message:""});
 return <form action={submit} className="supplier-form"
  style={{maxWidth:"none",gap:8,marginTop:12}}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="categoryId" value={categoryId}/>
  <input type="hidden" name="expectedName" value={currentName}/>
  <label htmlFor={"apex-category-rename-"+categoryId}>Edit category name
   <input id={"apex-category-rename-"+categoryId}
    name="newName" type="text" required minLength={2} maxLength={60}
    autoComplete="off" defaultValue={currentName}
    disabled={published||pending}/>
  </label>
  <button type="submit" className="button secondary"
   disabled={published||pending}>
   {pending?"Saving…":"Save category name"}
  </button>
  {published&&<p className="notice">Unpublish this category before renaming it.
   Product publication and checkout are managed separately.</p>}
  {state.message&&<p role="status" className="notice">{state.message}</p>}
 </form>;
}
