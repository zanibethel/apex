"use client";
import {useActionState} from "react";
import {
 validateAdminCartSelection,
 type AdminCartValidationResult,
} from "./cart-validation-actions";

const DEFAULT:AdminCartValidationResult={ok:false,message:"",item:null};
const MONEY=new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
});
const LABELS:Record<string,string>={
 supplier_requested:"Supplier selected Publish",
 admin_clear:"No active admin hold",
 identity_clear:"Supplier listing identity checked",
 content_review_clear:"Content review clear",
 product_setup_complete:"Private product setup complete",
 supplier_authorized:"Supplier release verified",
 product_authorized:"Product release verified",
 public_release_enabled:"Public release gate enabled",
};

export function AdminCartValidationForm({productId,quantity,expectedSubtotalCents}:{
 productId:string;quantity:number;expectedSubtotalCents:number;
}){
 const [state,submit,pending]=useActionState(
  validateAdminCartSelection,DEFAULT,
 );
 return <section className="apex-private-cart-validation"
  aria-label="Server-side cart validation">
  <h3>Verify live product data</h3>
  <p className="apex-checkout-support">Read the current saved price, inventory
   and release checks directly from Apex. This does not submit customer
   information, create an order or request a Bitcoin invoice.</p>
  <form action={submit}>
   <input type="hidden" name="productId" value={productId}/>
   <input type="hidden" name="quantity" value={quantity}/>
   <input type="hidden" name="expectedSubtotalCents" value={expectedSubtotalCents}/>
   <button type="submit" className="button secondary" disabled={pending}>
    {pending?"Checking…":"Validate saved price and stock"}
   </button>
  </form>
  {state.message&&<p role="status" className="notice">{state.message}</p>}
  {state.item&&<div className="apex-cart-observation">
   <p><strong>Displayed subtotal check:</strong>{" "}
    {state.item.subtotalMatchesDisplay?"Matched":"Changed — refresh product data"}</p>
   <p><strong>Saved unit price:</strong>{" "}
    {state.item.priceCents===null?"Not verified":
     MONEY.format(state.item.priceCents/100)}</p>
   <p><strong>Observed subtotal:</strong>{" "}
    {MONEY.format(state.item.observedSubtotalCents/100)}</p>
   <p><strong>Available stock:</strong>{" "}
    {state.item.availableUnits===null?"Not verified":state.item.availableUnits}</p>
   <p><strong>Requested quantity:</strong> {state.item.quantity}</p>
   <p><strong>Stock sufficient:</strong>{" "}
    {state.item.stockSufficient?"Observed sufficient":"No"}</p>
   <p><strong>Listing status:</strong> {state.item.releaseStatus.replaceAll("_"," ")}</p>
   <details>
    <summary>View independent release checks</summary>
    <ul>{state.item.checks.map(check=><li key={check.key}>
     {LABELS[check.key]??check.key}: {check.passed?"Checked":"Not satisfied"}
    </li>)}</ul>
   </details>
   <p className="notice">The database holds stock/price row locks only during
    this check. Locks expire before you see the result, and no inventory was
    reserved.</p>
   <p className="notice"><strong>No commercial quote or order is authorized.</strong>{" "}
    Shipping and taxes have not been calculated.</p>
  </div>}
 </section>;
}
