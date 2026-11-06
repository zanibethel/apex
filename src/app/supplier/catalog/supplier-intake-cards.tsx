"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import CompactVariantCard from "@/components/catalog/compact-variant-card";
import type {CardVariant} from "@/components/catalog/compact-variant-card";

export type IntakeCard={
 name:string;section:string;sourceRow:number;anchor:string;
 options:CardVariant[];compositionByVariantId:Record<string,string>;held:number;
};

export function SupplierIntakeCards({cards}:{cards:IntakeCard[]}){
 const [query,setQuery]=useState("");
 const [show,setShow]=useState("all");
 const visible=useMemo(()=>cards.filter(card=>{
  const text=(card.name+" "+card.section).toLowerCase();
  return text.includes(query.trim().toLowerCase())&&
   (show!=="held"||card.held>0);
 }),[cards,query,show]);
 const held=cards.filter(c=>c.held>0).length;
 return <section className="apex-supplier-intake" aria-label="Imported supplier product options">
  <p className="notice">These are the supplier&apos;s original proposed product options,
   grouped into one card each. They are not duplicates of saved products:
   match them to existing product identities before making edits or adding stock.</p>
  <div className="apex-bulk-filterbar">
   <label htmlFor="apex-intake-search">Find imported product
    <input id="apex-intake-search" type="search" value={query}
     placeholder="Search name or section"
     onChange={e=>setQuery(e.target.value)}/>
   </label>
   <label htmlFor="apex-intake-filter">Show
    <select id="apex-intake-filter" value={show}
     onChange={e=>setShow(e.target.value)}>
     <option value="all">All imported products ({cards.length})</option>
     <option value="held">Needs clarification ({held})</option>
    </select>
   </label>
  </div>
  <p className="notice" role="status">Showing {visible.length} of {cards.length} imported products.</p>
  <div className="apex-compact-product-grid">
   {visible.map(card=><div key={card.name} className="apex-supplier-intake-entry">
    {card.options.length?
     <CompactVariantCard name={card.name} category={card.section}
      variants={card.options} compositionByVariantId={card.compositionByVariantId}/>:
     <article className="apex-compact-product">
      <div className="apex-compact-product-body">
       <p className="apex-compact-product-category">{card.section}</p>
       <h3>{card.name}</h3>
       <p className="notice">Supplier clarification required.</p>
      </div>
     </article>}
    <div className="apex-supplier-intake-actions">
     {card.held>0&&<p className="notice">{card.held} option(s) held for clarification.</p>}
     <Link className="button secondary"
      href={"/supplier/catalog/variant-review#"+card.anchor}>
      Review options
     </Link>
    </div>
   </div>)}
  </div>
  {!visible.length&&<p role="status" className="notice">No matching imported products.</p>}
  <p className="notice">Reviewing the source does not create or publish a saved
   product. Existing product edits, inventory and image management stay in
   Saved products above.</p>
 </section>;
}
