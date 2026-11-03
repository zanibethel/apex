"use client";
import {useActionState} from "react";
import {reviewAdminDestinationCharges,type DestinationEstimate}
 from "./destination-charge-actions";

const DEFAULT:DestinationEstimate={ok:false,message:""};
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);
const asMoney=(n:number|undefined)=>n===undefined?"Unavailable":money(n);

export function AdminDestinationChargeForm({
 productId,quantity,expectedSubtotalCents,
}:{
 productId:string;quantity:number;expectedSubtotalCents:number;
}){
 const [state,action,pending]=useActionState(reviewAdminDestinationCharges,DEFAULT);
 return <section className="apex-private-destination-quote" aria-label="Saved destination and promotion estimate"
  style={{borderTop:"1px solid #45454d",paddingTop:16,marginTop:16}}>
  <h3>Delivery &amp; discount estimate</h3>
  <p className="notice">Uses current saved prices and store rules. A ZIP code and
   state help prepare tax verification but are not proof of a tax jurisdiction.</p>
  <form action={action} className="supplier-form" style={{gap:8,marginTop:10}}>
   <input type="hidden" name="productId" value={productId}/>
   <input type="hidden" name="quantity" value={quantity}/>
   <input type="hidden" name="expectedSubtotalCents" value={expectedSubtotalCents}/>
   <label htmlFor="dest-state">Destination state
    <input id="dest-state" name="state" placeholder="TX" defaultValue="TX"
     maxLength={2} required disabled={pending}
     autoComplete="off" style={{width:"100%"}}/>
   </label>
   <label htmlFor="dest-postal">Delivery ZIP code
    <input id="dest-postal" name="postal" inputMode="numeric"
     placeholder="79401" pattern="[0-9]{5}(-[0-9]{4})?"
     maxLength={10} required disabled={pending}
     autoComplete="off" style={{width:"100%"}}/>
   </label>
   <label htmlFor="dest-promotion">Discount or free-shipping code (optional)
    <input id="dest-promotion" name="code"
     placeholder="Discount code" maxLength={24}
     autoComplete="off" disabled={pending} style={{width:"100%"}}/>
   </label>
   <button type="submit" className="button secondary" disabled={pending}>
    {pending?"Rechecking…":"Recalculate saved charges"}
   </button>
  </form>
  {state.message&&<p role={state.ok?"status":"alert"} className="notice">{state.message}</p>}
  {state.ok&&<div aria-live="polite">
   {!state.subtotalMatchesDisplay&&
    <p role="alert">Saved price changed since this page loaded.
     Refresh before reviewing the updated checkout.</p>}
   <p className="notice">Destination: {state.destinationRegion} {state.destinationPostal}
    {" · "}Jurisdiction verification pending</p>
   <dl className="apex-checkout-prices">
    <div><dt>Saved merchandise</dt><dd>{asMoney(state.merchandiseSubtotalCents)}</dd></div>
    <div><dt>Promotion discount</dt><dd>{asMoney(state.merchandiseDiscountCents)}</dd></div>
    <div><dt>Shipping fee</dt><dd>{asMoney(state.shippingCents)}</dd></div>
    {(state.shippingDiscountCents??0)>0&&
     <div><dt>Shipping waived</dt><dd>{asMoney(state.shippingDiscountCents)}</dd></div>}
    <div><dt>Potentially taxable merchandise</dt>
     <dd>{asMoney(state.provisionalTaxableCents)}</dd></div>
    <div><dt>Sales tax</dt><dd>Awaiting verified destination quote</dd></div>
    <div className="apex-checkout-price-total">
     <dt>Before-tax estimate</dt><dd>{asMoney(state.preTaxTotalCents)}</dd>
    </div>
    <div><dt>Final total</dt><dd>Not yet available</dd></div>
   </dl>
   <p className="notice">
    {state.freeShippingReason==="discount_code"?
     "The eligible discount code waived shipping.":
     state.freeShippingReason==="subtotal_threshold"?
     "The discounted merchandise subtotal met the free-shipping threshold.":
     "Shipping is based on the current saved store policy."}
   </p>
   <p className="notice">{state.collectSalesTax?
    "Product is marked Collect sales tax.":
    "Product tax collection is unchecked; an exemption still needs verification."}
    {" "}Shipping taxability may affect the final amount.</p>
   <p className="notice">No invoice, payment, order, promotion redemption, or
    stock reservation has been created.</p>
  </div>}
 </section>;
}
