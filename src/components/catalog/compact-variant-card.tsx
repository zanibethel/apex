"use client";

import {useId,useMemo,useState} from "react";
import {validateProductOptions} from "@/lib/catalog/product-option-picker-v1.mjs";
import "./compact-variant-card.css";

export type CardVariant={
 id:string;carrierOil:string;strength:string;size:string;retailPriceCents:number;
};
type Props={
 name:string;category?:string;description?:string;
 variants:readonly CardVariant[];
};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);
const optionLabel=(variant:CardVariant)=>[
 variant.strength,variant.size,variant.carrierOil,
].filter(Boolean).join(" · ")||"Standard";

// Exactly ONE product card, regardless of how many options it has.
// This is a presentation-only component; the caller must supply an approved,
// public-safe list. There are no cart, stock, publishing or payment writes.
export default function CompactVariantCard({name,category,description,variants}:Props){
 const selectId=useId();
 const [chosenId,setChosenId]=useState("");
 const approved=useMemo(()=>validateProductOptions(variants),[variants]) as readonly CardVariant[]|null;
 if(!approved)return <article className="apex-compact-product" role="alert">
  Product options unavailable.
 </article>;
 const selected=approved.find(v=>v.id===chosenId)??approved[0];
 return <article className="apex-compact-product">
  <div className="apex-compact-product-art" aria-hidden="true">
   <span>▲</span>
  </div>
  <div className="apex-compact-product-body">
   {category&&<p className="apex-compact-product-category">{category}</p>}
   <h3>{name}</h3>
   {description&&<p className="apex-compact-product-description">{description}</p>}
   {approved.length>1?
    <label className="apex-compact-product-select" htmlFor={selectId}>
     <span>Choose option</span>
     <select id={selectId} value={selected.id}
      onChange={event=>{
       // Only accept IDs from this product's independently validated options.
       if(approved.some(v=>v.id===event.target.value))setChosenId(event.target.value);
      }}>
      {approved.map(v=><option key={v.id} value={v.id}>{optionLabel(v)}</option>)}
     </select>
    </label>:
    optionLabel(selected)!=="Standard"?
    <p className="apex-compact-product-fixed">{optionLabel(selected)}</p>:null}
   <div className="apex-compact-product-price" role="status" aria-live="polite">
    <strong>{money(selected.retailPriceCents)}</strong>
    <span>USD</span>
   </div>
   <p className="apex-compact-product-availability">Checkout unavailable</p>
  </div>
 </article>;
}
