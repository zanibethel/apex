"use client";

import {useActionState,useId,useState} from "react";
import {saveSupplierPromotion,toggleSupplierPromotion,previewSupplierDiscount}
 from "./actions";

const initial={ok:false,message:""};
type Discount={
 id:string;code:string;discount_kind:string;discount_value:number;
 min_subtotal_cents:number;starts_at:string|null;ends_at:string|null;
 usage_limit:number|null;redemption_count:number;is_active:boolean;store_id:string;
};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

export function PromotionEditor({storeId,existing,enabled}:{
 storeId:string;existing?:Discount;enabled:boolean;
}){
 const [state,action,pending]=useActionState(saveSupplierPromotion,initial);
 const id=useId();
 const [kind,setKind]=useState(existing?.discount_kind??"percentage");
 const value=existing?.discount_kind==="fixed"?
  (existing.discount_value/100).toFixed(2):existing?.discount_value??"";
 return <section className="supplier-panel apex-promo-panel">
  <h2>{existing?"Edit code":"Create discount code"}</h2>
  <form action={action} className="supplier-form apex-promo-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="promoId" value={existing?.id??""}/>
   <div className="apex-promo-grid">
    <label htmlFor={id+"code"}>Code
     <input id={id+"code"} name="code" defaultValue={existing?.code??""}
      readOnly={Boolean(existing)} required minLength={3} maxLength={24}
      autoCapitalize="characters" autoCorrect="off" spellCheck={false}
      pattern="[A-Za-z0-9_-]{3,24}" placeholder="WELCOME10"
      disabled={!enabled}/>
    </label>
    <label htmlFor={id+"kind"}>Discount type
     <select id={id+"kind"} name="kind" value={kind}
      onChange={e=>setKind(e.target.value)} disabled={!enabled}>
      <option value="percentage">Percentage off</option>
      <option value="fixed">Amount off</option>
      <option value="free_shipping">Free shipping</option>
     </select>
    </label>
    <label htmlFor={id+"value"}>
     {kind==="free_shipping"?"Shipping discount":"Discount value"}
     <input id={id+"value"} name="value" type="number"
      key={kind} defaultValue={kind==="free_shipping"?"":value}
      min={kind==="percentage"?1:0.01}
      max={kind==="percentage"?95:9999999.99}
      step={kind==="percentage"?1:0.01}
      required={kind!=="free_shipping"}
      disabled={!enabled||kind==="free_shipping"}
      placeholder={kind==="free_shipping"?"Entire shipping fee":kind==="percentage"?"10":"5.00"}/>
    </label>
    <label htmlFor={id+"min"}>Minimum order subtotal (USD)
     <input id={id+"min"} name="minimum" type="number"
      min="0" max="9999999.99" step=".01" required
      defaultValue={((existing?.min_subtotal_cents??0)/100).toFixed(2)}
      disabled={!enabled}/>
    </label>
    <label htmlFor={id+"limit"}>Maximum uses (optional)
     <input id={id+"limit"} name="usageLimit" type="number"
      min={1} max={1000000} step={1}
      defaultValue={existing?.usage_limit??""}
      placeholder="Unlimited" disabled={!enabled}/>
    </label>
    {!existing&&<label htmlFor={id+"status"}>Status
     <select id={id+"status"} name="initialStatus" defaultValue="active"
      disabled={!enabled}>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
     </select>
    </label>}
    <label htmlFor={id+"start"}>Start date (optional)
     <input id={id+"start"} name="startsAt" type="datetime-local"
      defaultValue={existing?.starts_at?.slice(0,16)??""} disabled={!enabled}/>
    </label>
    <label htmlFor={id+"end"}>End date (optional)
     <input id={id+"end"} name="endsAt" type="datetime-local"
      defaultValue={existing?.ends_at?.slice(0,16)??""} disabled={!enabled}/>
    </label>
   </div>
   <button className="button secondary" type="submit" disabled={pending||!enabled}>
    {pending?"Saving…":existing?"Save changes":"Create code"}
   </button>
   {state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}
  </form>
 </section>;
}

export function PromotionStatus({storeId,promotion,enabled}:{
 storeId:string;promotion:Discount;enabled:boolean;
}){
 const [state,action,pending]=useActionState(toggleSupplierPromotion,initial);
 return <form action={action} className="apex-promo-status-form">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="promoId" value={promotion.id}/>
  <input type="hidden" name="enabled" value={String(!promotion.is_active)}/>
  <button className="button secondary" type="submit" disabled={!enabled||pending}>
   {pending?"Saving…":promotion.is_active?"Deactivate code":"Activate code"}
  </button>
  {state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}
 </form>;
}

export function PromotionCalculator({storeId}:{storeId:string}){
 const [state,action,pending]=useActionState(previewSupplierDiscount,initial);
 const id=useId();
 return <details className="supplier-panel apex-promo-panel apex-promo-calculator">
  <summary>Discount calculator</summary>
  <form action={action} className="supplier-form apex-promo-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <div className="apex-promo-grid">
    <label htmlFor={id+"code"}>Discount code
     <input id={id+"code"} name="code" required maxLength={24}
      autoCapitalize="characters" autoCorrect="off" spellCheck={false}
      placeholder="WELCOME10"/>
    </label>
    <label htmlFor={id+"total"}>Order subtotal (USD)
     <input id={id+"total"} name="subtotal" type="number" min="0" step=".01"
      required placeholder="100.00"/>
    </label>
   </div>
   <button className="button secondary" disabled={pending} type="submit">
    {pending?"Calculating…":"Calculate discount"}
   </button>
  </form>
  {state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}
  {state.ok&&state.subtotalCents!==undefined&&
   state.discountCents!==undefined&&state.shippingCents!==undefined&&
   state.totalCents!==undefined&&
   <dl className="apex-promo-calculation" aria-label="Discount calculation">
    <div><dt>Subtotal</dt><dd>{money(state.subtotalCents)}</dd></div>
    <div><dt>Discount</dt><dd>−{money(state.discountCents)}</dd></div>
    <div><dt>Shipping</dt><dd>{state.shippingCents===0?
     "Free":money(state.shippingCents)}</dd></div>
    <div><dt>Total</dt><dd>{money(state.totalCents)}</dd></div>
   </dl>}
 </details>;
}
