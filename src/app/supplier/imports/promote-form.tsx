"use client";

import { useActionState, useId } from "react";
import { createDraftFromReviewedVariant } from "./actions";
import {importDefaultDescription} from "@/lib/catalog/import-default-descriptions.mjs";

export function PromoteReviewedVariantForm({storeId,candidateId,productName,strength,enabled}:{
  storeId:string;
  candidateId:string;
  productName:string;
  strength:string;
  enabled:boolean;
}) {
  const [state,action,pending]=useActionState(createDraftFromReviewedVariant,{ok:false,message:""});
  const id=useId();

  return <section className="supplier-panel" style={{marginTop:12,padding:16}}>
    <h3>Create private draft</h3>
    <p className="notice">{productName} · {strength} — the draft name will be copied from this reviewed source.</p>
    {state.ok ? <p role="status">{state.message}</p> : <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <input type="hidden" name="candidateId" value={candidateId}/>
      <label htmlFor={id+"sku"}>SKU (optional)</label>
      <input id={id+"sku"} name="sku" maxLength={60} autoComplete="off" disabled={!enabled}
        placeholder="Auto-generated when blank"/>
      <p className="notice">A unique SKU will be generated for this variant if you leave the field blank.</p>
      <label htmlFor={id+"price"}>Customer purchase price (USD)</label>
      <input id={id+"price"} name="retailPrice" type="number" min="0.01" max="9999999.99" step="0.01"
        required disabled={!enabled} placeholder="Not the wholesale cost"/>
      <label htmlFor={id+"compare"}>Compare-at price (optional, USD)</label>
      <input id={id+"compare"} name="comparePrice" type="number" min="0.01"
        max="9999999.99" step="0.01" disabled={!enabled}
        placeholder="A genuine higher reference price"/>
      <p className="notice">Do not use the source cost as a comparison price.</p>
      <label htmlFor={id+"quantity"}>Actual on-hand quantity (0 if unknown)</label>
      <input id={id+"quantity"} name="confirmedStock" type="number" min={0} max={1000000} step={1}
        defaultValue={0} required disabled={!enabled}/>
      <label htmlFor={id+"desc"}>Private draft description (editable suggested text)</label>
      <textarea id={id+"desc"} name="description" rows={4} maxLength={1500} disabled={!enabled}
       defaultValue={importDefaultDescription(productName,strength)??""}/>
      <label>
        <input type="checkbox" name="confirmedPrice" required disabled={!enabled}/>
        I verified this price separately; it is not copied from the wholesale-cost sheet.
      </label>
      <label>
        <input type="checkbox" name="stockVerified" disabled={!enabled}/>
        I verified any nonzero stock quantity entered above.
      </label>
      <button className="button secondary" type="submit" disabled={!enabled||pending}>
        {pending ? "Creating draft…" : "Create private draft"}
      </button>
      {state.message && <p role="status" className="supplier-error">{state.message}</p>}
    </form>}
    <p className="notice">Creating a draft does not publish the listing or enable checkout.</p>
  </section>;
}
