"use client";

import {useActionState} from "react";
import {saveProductShippingProfile,removeProductShippingProfile} from "./profile-actions";

type Profile={
 length_mm:number;width_mm:number;height_mm:number;
 weight_g:number;flexible:boolean;updated_at:string;
};
const EMPTY={ok:false,message:""};
const inches=(mm:number)=>(mm/25.4).toFixed(2);
const ounces=(g:number)=>(g/28.349523125).toFixed(2);

export function ProductShippingProfileForm({storeId,productId,name,sku,initial,enabled}:{
 storeId:string;productId:string;name:string;sku:string;
 initial:Profile|null;enabled:boolean;
}){
 const [saved,save,pending]=useActionState(saveProductShippingProfile,EMPTY);
 const [removed,remove,removing]=useActionState(removeProductShippingProfile,EMPTY);
 const expected=initial?.updated_at??"none";
 return <article className="supplier-panel apex-product-shipping-card">
  <h3>{name}</h3>
  <p className="notice">SKU: {sku} · {initial?"Packed dimensions saved":"Needs packed dimensions"}</p>
  <form action={save} className="supplier-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="productId" value={productId}/>
   <input type="hidden" name="expectedUpdatedAt" value={expected}/>
   <div className="apex-shipping-dimension-grid">
    <label>Length (in)
     <input name="lengthInches" type="number" min="0.01" max="78.74" step="0.01"
      defaultValue={initial?inches(initial.length_mm):""} required
      disabled={!enabled||pending||removing} placeholder="Packed length"/>
    </label>
    <label>Width (in)
     <input name="widthInches" type="number" min="0.01" max="78.74" step="0.01"
      defaultValue={initial?inches(initial.width_mm):""} required
      disabled={!enabled||pending||removing} placeholder="Packed width"/>
    </label>
    <label>Height (in)
     <input name="heightInches" type="number" min="0.01" max="78.74" step="0.01"
      defaultValue={initial?inches(initial.height_mm):""} required
      disabled={!enabled||pending||removing} placeholder="Packed height"/>
    </label>
    <label>Weight per unit (oz)
     <input name="weightOunces" type="number" min="0.01" max="1119.9" step="0.01"
      defaultValue={initial?ounces(initial.weight_g):""} required
      disabled={!enabled||pending||removing} placeholder="Packed weight"/>
    </label>
   </div>
   <label>Can this packed item safely go in a padded envelope?
    <select name="flexible" defaultValue={initial?.flexible?"true":"false"}
     disabled={!enabled||pending||removing}>
     <option value="false">No — box only (rigid or fragile)</option>
     <option value="true">Yes — flexible and non-fragile</option>
    </select>
   </label>
   <p className="notice">Measure one fully packed unit, including padding.
    Do not use an unverified manufacturer dimension. The calculator can use
    multiple boxes; these are estimates, not guaranteed fit or live carrier rates.</p>
   <button className="button secondary" type="submit" disabled={!enabled||pending||removing}>
    {pending?"Saving…":"Save measurements"}
   </button>
   {saved.message&&<p role={saved.ok?"status":"alert"}>{saved.message}</p>}
  </form>
  {initial&&<form action={remove} className="apex-shipping-clear-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="productId" value={productId}/>
   <input type="hidden" name="expectedUpdatedAt" value={expected}/>
   <button className="button secondary" type="submit" disabled={!enabled||pending||removing}>
    {removing?"Clearing…":"Clear measurements"}
   </button>
   {removed.message&&<p role={removed.ok?"status":"alert"}>{removed.message}</p>}
  </form>}
 </article>;
}
