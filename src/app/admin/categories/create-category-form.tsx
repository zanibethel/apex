"use client";
import {useActionState} from "react";
import {createAdminCategory} from "./actions";

export function CreateAdminCategoryForm({stores}:{
 stores:ReadonlyArray<{id:string;name:string}>;
}){
 const [state,submit,pending]=useActionState(createAdminCategory,{
  ok:false,message:"",
 });
 return <form action={submit} className="supplier-form"
  style={{maxWidth:"none",gap:12}}>
  <label htmlFor="apex-new-category-store">Storefront
   <select id="apex-new-category-store" name="storeId"
    required disabled={pending} defaultValue={stores.length===1?stores[0].id:""}>
    {stores.length!==1&&<option value="">Choose storefront</option>}
    {stores.map(store=><option key={store.id} value={store.id}>
     {store.name}</option>)}
   </select>
  </label>
  <label htmlFor="apex-new-category-name">Category name
   <input id="apex-new-category-name" name="name" type="text"
    minLength={2} maxLength={60} required disabled={pending}
    placeholder="e.g. Accessories" autoComplete="off"/>
  </label>
  <button type="submit" className="button primary" disabled={pending||!stores.length}>
   {pending?"Creating…":"Create category"}
  </button>
  {state.message&&<p role="status" className="notice">{state.message}</p>}
 </form>;
}
