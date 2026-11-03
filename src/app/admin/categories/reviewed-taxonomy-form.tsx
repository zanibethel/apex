"use client";
import {useActionState} from "react";
import {createReviewedTaxonomyCategories} from "./actions";

export function ReviewedTaxonomyCategoryForm({storeId,names,missing}:{
 storeId:string;names:ReadonlyArray<string>;missing:ReadonlyArray<string>;
}){
 const [result,submit,pending]=useActionState(createReviewedTaxonomyCategories,{
  ok:false,message:"",
 });
 return <section className="supplier-panel"
  aria-label="Reviewed taxonomy categories"
  style={{maxWidth:"none",marginBottom:22}}>
  <h2>Set up catalog categories</h2>
  <p className="notice">This catalog has a reviewed 63-product category plan.
   The eight proposed research groups can be created here, each as
   <strong> unpublished</strong>. Product assignments and release checks
   remain separate.</p>
  <details>
   <summary>Review the proposed category names</summary>
   <ul>{names.map(name=><li key={name}>{name}</li>)}</ul>
  </details>
  <p className="notice">{missing.length} of {names.length} categories
   still need to be created for this storefront.</p>
  <form action={submit}>
   <input name="storeId" type="hidden" value={storeId}/>
   <button className="button secondary" type="submit"
    disabled={pending||missing.length===0}>
    {pending?"Creating…":"Create "+missing.length+" missing categories"}
   </button>
  </form>
  {result.message&&<p role="status" className="notice">{result.message}</p>}
  <p className="notice">This does not activate products, publish listings,
   or change checkout. An authorized supplier still reviews and saves
   each proposed product-category assignment.</p>
 </section>;
}
