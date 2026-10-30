"use client";

import { useActionState, useId } from "react";
import { saveSupplierPromotion, toggleSupplierPromotion, previewSupplierDiscount } from "./actions";

const initial={ok:false,message:""};
type Discount={id:string;code:string;discount_kind:string;discount_value:number;min_subtotal_cents:number;
starts_at:string|null;ends_at:string|null;usage_limit:number|null;redemption_count:number;is_active:boolean;store_id:string};

export function PromotionEditor({storeId,existing,enabled}:{storeId:string;existing?:Discount;enabled:boolean}) {
  const [state,action,pending]=useActionState(saveSupplierPromotion,initial);
  const id=useId();
  const value=existing?.discount_kind==="fixed"?(existing.discount_value/100).toFixed(2):existing?.discount_value??"";
  return <section className="supplier-panel" style={{maxWidth:"none"}}>
    <h3>{existing ? `Edit ${existing.code}` : "Create discount code"}</h3>
    <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <input type="hidden" name="promoId" value={existing?.id??""}/>
      <label htmlFor={id+"code"}>Discount code</label>
      <input id={id+"code"} name="code" defaultValue={existing?.code??""}
        readOnly={!!existing} required minLength={3} maxLength={24}
        pattern="[A-Za-z0-9_-]{3,24}" disabled={!enabled}/>
      <label htmlFor={id+"kind"}>Discount type</label>
      <select id={id+"kind"} name="kind" defaultValue={existing?.discount_kind??"percentage"} disabled={!enabled}>
        <option value="percentage">Percent off (1–95%)</option>
        <option value="fixed">Fixed USD amount off</option>
      </select>
      <label htmlFor={id+"value"}>Value (percentage or USD, based on selected type)</label>
      <input id={id+"value"} name="value" defaultValue={value} required disabled={!enabled} placeholder="10 or 5.00"/>
      <label htmlFor={id+"min"}>Minimum subtotal (USD)</label>
      <input id={id+"min"} name="minimum" type="number" min="0" max="9999999.99"
        step=".01" required defaultValue={((existing?.min_subtotal_cents??0)/100).toFixed(2)} disabled={!enabled}/>
      <label htmlFor={id+"limit"}>Maximum redemptions (optional)</label>
      <input id={id+"limit"} name="usageLimit" type="number" min={1} max={1000000}
        step={1} defaultValue={existing?.usage_limit??""} disabled={!enabled}/>
      <label htmlFor={id+"start"}>Start date/time (optional)</label>
      <input id={id+"start"} name="startsAt" type="datetime-local"
        defaultValue={existing?.starts_at?.slice(0,16)??""} disabled={!enabled}/>
      <label htmlFor={id+"end"}>End date/time (optional)</label>
      <input id={id+"end"} name="endsAt" type="datetime-local"
        defaultValue={existing?.ends_at?.slice(0,16)??""} disabled={!enabled}/>
      <button className="button secondary" type="submit" disabled={pending||!enabled}>
        {pending?"Saving…":existing?"Save code rules":"Create inactive code"}
      </button>
      {state.message&&<p role="status">{state.message}</p>}
    </form>
  </section>;
}

export function PromotionStatus({storeId,promotion,enabled}:{storeId:string;promotion:Discount;enabled:boolean}) {
  const [state,action,pending]=useActionState(toggleSupplierPromotion,initial);
  return <form action={action} className="supplier-form">
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="promoId" value={promotion.id}/>
    <input type="hidden" name="enabled" value={String(!promotion.is_active)}/>
    <button className="button secondary" type="submit" disabled={!enabled||pending}>
      {pending?"Updating…":promotion.is_active?"Disable code":"Enable code in preview"}
    </button>
    {state.message&&<p role="status">{state.message}</p>}
  </form>;
}

export function PreviewPromotion({storeId}:{storeId:string}) {
  const [state,action,pending]=useActionState(previewSupplierDiscount,initial);
  const id=useId();
  return <section className="supplier-panel" style={{maxWidth:"none"}}>
    <h2>Simulate checkout discount</h2>
    <p className="notice">Enter a test subtotal. No orders, payment requests or redemption counts are changed.</p>
    <form action={action} className="supplier-form">
      <input type="hidden" name="storeId" value={storeId}/>
      <label htmlFor={id+"code"}>Code</label>
      <input id={id+"code"} name="code" required maxLength={24} placeholder="WELCOME10"/>
      <label htmlFor={id+"total"}>Test subtotal (USD)</label>
      <input id={id+"total"} name="subtotal" type="number" min={0} step=".01" required defaultValue="100.00"/>
      <button className="button secondary" disabled={pending} type="submit">{pending?"Calculating…":"Preview discount"}</button>
    </form>
    {state.message&&<p role="status">{state.message}</p>}
  </section>;
}
