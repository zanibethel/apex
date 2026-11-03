"use client";
import {useActionState} from "react";
import {reviewAdminDestinationCharges,type DestinationEstimate}
 from "./destination-charge-actions";

const DEFAULT:DestinationEstimate={ok:false,message:""};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);
const amount=(cents:number|undefined)=>cents===undefined?"Unavailable":money(cents);

export function AdminDestinationChargeForm({
 productId,quantity,expectedSubtotalCents,
}:{productId:string;quantity:number;expectedSubtotalCents:number}){
 const [state,action,pending]=useActionState(reviewAdminDestinationCharges,DEFAULT);
 return <section className="apex-private-destination-quote"
  aria-label="Saved merchandise, discount and shipping estimate"
  style={{borderTop:"1px solid #45454d",paddingTop:16,marginTop:16}}>
  <h3>Discount &amp; shipping estimate</h3>
  <p className="notice">This review uses saved catalog pricing and shipping
   rules. Enter an optional promotion code to check the merchandise discount
   or free-shipping benefit.</p>
  <form action={action} className="supplier-form" style={{gap:8,marginTop:10}}>
   <input type="hidden" name="productId" value={productId}/>
   <input type="hidden" name="quantity" value={quantity}/>
   <input type="hidden" name="expectedSubtotalCents" value={expectedSubtotalCents}/>
   <label htmlFor="dest-promotion">Discount or free-shipping code (optional)
    <input id="dest-promotion" name="code" placeholder="Discount code"
     maxLength={24} autoComplete="off" disabled={pending}
     style={{width:"100%"}}/>
   </label>
   <button type="submit" className="button secondary" disabled={pending}>
    {pending?"Rechecking…":"Recalculate total"}
   </button>
  </form>
  {state.message&&<p role={state.ok?"status":"alert"} className="notice">
   {state.message}</p>}
  {state.ok&&<div aria-live="polite">
   {!state.subtotalMatchesDisplay&&
    <p role="alert">Saved product price has changed.
     Refresh to inspect the updated checkout total.</p>}
   <dl className="apex-checkout-prices">
    <div><dt>Merchandise</dt><dd>{amount(state.merchandiseSubtotalCents)}</dd></div>
    <div><dt>Discount</dt><dd>{amount(state.merchandiseDiscountCents)}</dd></div>
    <div><dt>Shipping</dt><dd>{(state.shippingCents??0)===0?
     "Free":amount(state.shippingCents)}</dd></div>
    {(state.shippingDiscountCents??0)>0&&
     <div><dt>Free shipping benefit</dt>
      <dd>{amount(state.shippingDiscountCents)}</dd></div>}
    <div className="apex-checkout-price-total">
     <dt>Estimated total</dt><dd>{amount(state.totalCents)}</dd>
    </div>
   </dl>
   <p className="notice">
    {state.freeShippingReason==="discount_code"?
     "The discount code waived the shipping fee.":
     state.freeShippingReason==="subtotal_threshold"?
     "The discounted merchandise subtotal qualified for free shipping.":
     "The saved shipping policy determines the fee."}
   </p>
   <p className="notice">This is a pricing review, not an order.
    Stock reservation, checkout and Bitcoin invoicing remain disabled.</p>
  </div>}
 </section>;
}
