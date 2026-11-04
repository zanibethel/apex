"use client";
import {useActionState,useState} from "react";
import {saveStoreShippingConfiguration} from "./actions";

export type ShippingRules={
 charge_shipping:boolean;
 flat_shipping_cents:number;
 medium_flat_shipping_cents:number;
 free_shipping_min_subtotal_cents:number|null;
 envelope_max_items:number;
};
export const NO_SHIPPING:ShippingRules={
 charge_shipping:false,flat_shipping_cents:0,medium_flat_shipping_cents:0,
 free_shipping_min_subtotal_cents:null,envelope_max_items:4,
};
const EMPTY={ok:false,message:""};
const money=(cents:number)=>(cents/100).toFixed(2);

export function ShippingSettingsForm({storeId,initial,enabled=true}:{
 storeId:string;initial:ShippingRules;enabled?:boolean;
}){
 const [state,action,pending]=useActionState(saveStoreShippingConfiguration,EMPTY);
 const [charge,setCharge]=useState(initial.charge_shipping);
 return <section className="supplier-panel" aria-label="USPS Flat Rate shipping settings"
  style={{maxWidth:"none"}}>
  <h2>USPS Priority Mail Flat Rate</h2>
  <p className="notice">Configure Padded Flat Rate Envelope and Medium Flat Rate Box charges.
   Free shipping applies when merchandise after discounts exceeds $200.
   Shipping charges are waived by an eligible free-shipping code.</p>
  <form action={action} className="supplier-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <label htmlFor="charge-shipping">Charge shipping?</label>
   <select id="charge-shipping" name="chargeShipping" value={String(charge)}
    disabled={!enabled||pending}
    onChange={e=>setCharge(e.target.value==="true")}>
    <option value="true">Yes — USPS padded envelope / Medium box</option>
    <option value="false">No — free shipping on every order</option>
   </select>
   <label htmlFor="small-flat-shipping">Padded Flat Rate Envelope (USD)</label>
   <input id="small-flat-shipping" name="smallFlatShipping" type="number"
    min=".01" max="9999999.99" step=".01"
    defaultValue={money(initial.charge_shipping?initial.flat_shipping_cents:1500)}
    disabled={!charge||!enabled||pending} required={charge}/>
   <label htmlFor="medium-flat-shipping">Medium Flat Rate Box (USD)</label>
   <input id="medium-flat-shipping" name="mediumFlatShipping" type="number"
    min=".01" max="9999999.99" step=".01"
    defaultValue={money(initial.charge_shipping?initial.medium_flat_shipping_cents:2580)}
    disabled={!charge||!enabled||pending} required={charge}/>
   <label htmlFor="envelope-max-items">Maximum items in padded envelope</label>
   <input id="envelope-max-items" name="envelopeMaxItems" type="number"
    min={1} max={50} step={1}
    defaultValue={initial.envelope_max_items}
    disabled={!enabled||pending} required/>
   <p className="notice">At or below this number of items, shipping defaults to the
    padded envelope. Larger carts automatically use the Medium box. The limit
    is a packing estimate, not a USPS quantity rule. Confirm actual fit
    before dispatching.</p>
   <label htmlFor="free-shipping-min">Free shipping at merchandise subtotal (USD)</label>
   <input id="free-shipping-min" name="freeShippingMinimum" type="number"
    min=".01" max="9999999.99" step=".01"
    defaultValue={money(initial.free_shipping_min_subtotal_cents??20001)}
    disabled={!charge||!enabled||pending} required={charge}/>
   <p className="notice">For orders over $200, set this amount to 200.01.
    Qualification uses merchandise after any product discount, excluding shipping.
    Use the padded envelope for standard shipments and the Medium box when items do not fit.
    The fulfillment team must confirm that each packed order fits its packaging.
    USPS prices can be changed here when carrier rates change.</p>
   <button type="submit" className="button secondary"
    disabled={!enabled||pending}>{pending?"Saving…":"Save shipping settings"}</button>
   {state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}
  </form>
 </section>;
}
