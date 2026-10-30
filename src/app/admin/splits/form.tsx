"use client";

import { useActionState, useId } from "react";
import { saveDraftPayoutSplit } from "./actions";

export function SplitForm({storeId,supplierPercent,enabled}:{
  storeId:string;supplierPercent:number;enabled:boolean
}) {
  const [state,submit,pending]=useActionState(saveDraftPayoutSplit,{ok:false,message:""});
  const uid=useId();
  return <form className="supplier-form" action={submit}>
    <input type="hidden" name="storeId" value={storeId}/>
    <label htmlFor={uid}>Proposed supplier allocation (%)</label>
    <input id={uid} type="number" name="supplierPercent" min={0} max={100}
      step={1} defaultValue={supplierPercent} required disabled={!enabled}/>
    <p className="notice">Platform share is 100% minus this amount. Changes here never trigger or redirect a Bitcoin payout.</p>
    <button className="button primary" type="submit" disabled={!enabled||pending}>Save draft allocation</button>
    {state.message && <p role="status">{state.message}</p>}
    {!enabled && <p className="notice">Draft split editing is disabled until its database audit and authorization gates pass review.</p>}
  </form>;
}
