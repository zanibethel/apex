"use client";

import { useActionState, useId } from "react";
import { createDraftFromReviewedVariant } from "./actions";

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
      <label htmlFor={id+"sku"}>New SKU</label>
      <input id={id+"sku"} name="sku" maxLength={60} autoComplete="off" required disabled={!enabled}
        placeholder="Unique internal SKU"/>
      <label htmlFor={id+"price"}>Confirmed draft retail price (USD)</label>
      <input id={id+"price"} name="retailPrice" type="number" min="0.01" max="9999999.99" step="0.01"
        required disabled={!enabled} placeholder="Not the wholesale cost"/>
      <label htmlFor={id+"quantity"}>Actual on-hand quantity (0 if unknown)</label>
      <input id={id+"quantity"} name="confirmedStock" type="number" min={0} max={1000000} step={1}
        defaultValue={0} required disabled={!enabled}/>
      <label htmlFor={id+"desc"}>Private draft description (optional)</label>
      <textarea id={id+"desc"} name="description" rows={2} maxLength={1500} disabled={!enabled}/>
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
