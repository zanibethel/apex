"use client";
import {useActionState,useState} from "react";
import {saveStoreShippingConfiguration} from "./actions";

export type ShippingRules={
 charge_shipping:boolean;flat_shipping_cents:number;
 free_shipping_min_subtotal_cents:number|null;
};
export const NO_SHIPPING:ShippingRules={
 charge_shipping:false,flat_shipping_cents:0,
 free_shipping_min_subtotal_cents:null,
};
const EMPTY={ok:false,message:""};
export function ShippingSettingsForm({storeId,initial,enabled=true}:{
 storeId:string;initial:ShippingRules;enabled?:boolean;
}){
 const [state,action,pending]=useActionState(saveStoreShippingConfiguration,EMPTY);
 const [charge,setCharge]=useState(initial.charge_shipping);
 return <section className="supplier-panel" aria-label="Optional shipping rules"
  style={{maxWidth:"none"}}>
  <h2>Shipping charges</h2>
  <p className="notice">Charge a flat shipping fee only when you choose to.
   You can offer free shipping for orders meeting a minimum amount or
   through a free-shipping discount code.</p>
  <form action={action} className="supplier-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <label htmlFor="charge-shipping">
    Apply a shipping fee?
   </label>
   <select id="charge-shipping" name="chargeShipping" value={String(charge)}
    disabled={!enabled||pending}
    onChange={e=>setCharge(e.target.value==="true")}>
    <option value="false">No — free shipping by default</option>
    <option value="true">Yes — use flat shipping rate</option>
   </select>
   <label htmlFor="flat-shipping">Shipping fee (USD)</label>
   <input id="flat-shipping" name="flatShipping" type="number"
    min="0" max="9999999.99" step=".01"
    defaultValue={(initial.flat_shipping_cents/100).toFixed(2)}
    disabled={!charge||!enabled||pending} required={charge}/>
   <label htmlFor="free-shipping-min">
    Free shipping at merchandise subtotal (USD, optional)
   </label>
   <input id="free-shipping-min" name="freeShippingMinimum" type="number"
    min=".01" max="9999999.99" step=".01"
    defaultValue={initial.free_shipping_min_subtotal_cents===null?""
      :(initial.free_shipping_min_subtotal_cents/100).toFixed(2)}
    disabled={!charge||!enabled||pending}
    placeholder="Example: 100.00"/>
   <p className="notice">The threshold uses merchandise after product discounts,
    before tax and shipping. Leaving it blank disables automatic
    free shipping. An eligible free-shipping code can still waive the fee.</p>
   <button type="submit" className="button secondary"
    disabled={!enabled||pending}>{pending?"Saving…":"Save shipping rules"}</button>
   {state.message&&<p role="status">{state.message}</p>}
  </form>
  <p className="notice">The saved policy is private. Real delivery availability,
   shipping costs, tax jurisdiction and order placement require separate validation.</p>
 </section>;
}
