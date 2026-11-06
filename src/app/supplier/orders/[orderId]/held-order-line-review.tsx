"use client";

import {useState} from "react";
import {summarizeReviewAllocations}
 from "@/lib/supplier/review-only-fulfillment-state.mjs";

type ReviewLine={
 id:string;lineNumber:number;sku:string;title:string;variant:string;
 quantity:number;unitPriceCents:number;subtotalCents:number;
};
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);

export function HeldOrderLineReview({lines}:{
 lines:ReviewLine[],
}){
 const [entered,setEntered]=useState<Record<string,string>>({});
 const rows=lines.map(line=>({
  lineId:line.id,purchasedQuantity:line.quantity,
  plannedQuantity:0,newPlanQuantity:Number(entered[line.id]??"0"),
 }));
 const preview=rows.length?summarizeReviewAllocations(rows):null;
 return <section className="apex-orders-line-review" aria-label="Original purchased items">
  <h3>Original purchase lines</h3>
  <p className="notice">These are saved purchase-time item details, not
   current catalog prices or supplier inventory.</p>
  {!lines.length?<p role="status">No saved line snapshots exist
   for this original held order.</p>:<>
   <div className="apex-orders-line-list">
    {lines.map(line=><article key={line.id} className="apex-orders-line">
     <div className="apex-orders-reference">
      <strong>{line.title}</strong>
      <span className="apex-orders-held-chip">Held · not shippable</span>
     </div>
     <dl className="apex-orders-line-metadata">
      <div><dt>SKU at purchase</dt><dd>{line.sku}</dd></div>
      <div><dt>Option at purchase</dt><dd>{line.variant||"Standard"}</dd></div>
      <div><dt>Purchased quantity</dt><dd>{line.quantity}</dd></div>
      <div><dt>Unit price at purchase</dt><dd>{money(line.unitPriceCents)}</dd></div>
      <div><dt>Line total</dt><dd>{money(line.subtotalCents)}</dd></div>
     </dl>
     <label htmlFor={"review-line-"+line.id}>Quantity to consider for a future partial fulfillment</label>
     <input id={"review-line-"+line.id} type="number"
      min={0} max={line.quantity} step={1}
      value={entered[line.id]??"0"}
      onChange={e=>setEntered(v=>({...v,[line.id]:e.target.value}))}
      aria-describedby={"review-line-note-"+line.id}/>
     <small id={"review-line-note-"+line.id}>
      Preview only. Does not save, reserve, pack, ship or purchase a label.
     </small>
    </article>)}
   </div>
   {preview?<p className="apex-orders-preview-summary" role="status">
    Preview: {preview.requestedUnits} of
    {" "}{lines.reduce((n,line)=>n+line.quantity,0)} units selected
    {" · "}{preview.remainingUnplannedUnits} remaining.
    {" "}No quantity changes have been saved.
   </p>:<p className="apex-orders-warning" role="alert">
    Invalid quantity selection. Enter a whole number between 0 and the
    purchased quantity for each line. No changes have been made.
   </p>}
  </>}
  <p className="notice">Independent product eligibility, settlement,
   protected delivery authorization, shipping and tracking are not
   established by this view. All controls here are local previews.</p>
 </section>;
}
