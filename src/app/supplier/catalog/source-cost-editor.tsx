"use client";
import {useActionState,useId} from "react";
import {saveSupplierSourceCost} from "./source-cost-actions";

export function SourceCostEditor({storeId,candidateId,costCents,enabled}:{
  storeId:string;candidateId:string;costCents:number;enabled:boolean;
}) {
  const [state,action,pending]=useActionState(saveSupplierSourceCost,{ok:false,message:""});
  const id=useId();
  return <form className="apex-cost-edit" action={action}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="candidateId" value={candidateId}/>
    <input type="hidden" name="expectedCostCents" value={costCents}/>
    <label htmlFor={id}>Source cost (USD) · private</label>
    <div className="apex-cost-row">
      <input id={id} name="sourceCost" type="number" min="0" max="9999999.99" step=".01"
        defaultValue={(costCents/100).toFixed(2)} required disabled={!enabled||pending}/>
      <button className="button secondary" type="submit" disabled={!enabled||pending}>
        {pending?"Saving…":"Save cost"}
      </button>
    </div>
    <small className="notice">Wholesale acquisition cost; not the customer price.</small>
    {state.message&&<p role="status" className="notice">{state.message}</p>}
  </form>;
}
