"use client";
import {useId,useMemo,useState} from "react";
import {
 validateProductOptions,productOptionChoices,pickProductOption,
} from "@/lib/catalog/product-option-picker-v1.mjs";
import "./product-options.css";

export type ProductOption={
 id:string;carrierOil:string;strength:string;size:string;retailPriceCents:number;
};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

// Reusable presentation only. Never saves cart selections or authorizes sales.
// The connected catalog must supply independently released option rows later.
export default function ProductOptions({variants}:{
 variants:readonly ProductOption[];
}){
 const base=useId();
 const [chosenId,setChosenId]=useState("");
 const approved=useMemo(()=>validateProductOptions(variants),[variants]) as readonly ProductOption[]|null;
 if(!approved)return <p role="alert">Product options are unavailable.</p>;
 const selected=approved.find(row=>row.id===chosenId)||approved[0];
 const fields=[
  {field:"carrierOil",label:"Carrier oil",values:productOptionChoices(approved,selected.id,"carrierOil")},
  {field:"strength",label:"Strength",values:productOptionChoices(approved,selected.id,"strength")},
  {field:"size",label:"Size",values:productOptionChoices(approved,selected.id,"size")},
 ] as const;
 return <section className="apex-product-options" aria-label="Product options">
  <div className="apex-product-options-fields">
   {fields.map(({field,label,values})=>values.length>1?
    <label key={field} htmlFor={base+"-"+field}>
     <span>{label}</span>
     <select id={base+"-"+field} value={selected[field]}
      onChange={event=>{
       const next=pickProductOption(approved,selected.id,field,event.target.value);
       if(next)setChosenId(next.id);
      }}>
      {values.map(value=><option key={value} value={value}>{value||"Not specified"}</option>)}
     </select>
    </label>:values[0]?
    <p className="apex-product-options-single" key={field}>
     <span>{label}:</span> {values[0]}
    </p>:null)}
  </div>
  <div className="apex-product-options-bottom" role="status" aria-live="polite">
   <strong>{money(selected.retailPriceCents)}</strong>
   <span>Selected option · USD</span>
  </div>
  <button className="apex-approved-disabled" type="button" disabled>
   Checkout unavailable
  </button>
 </section>;
}
