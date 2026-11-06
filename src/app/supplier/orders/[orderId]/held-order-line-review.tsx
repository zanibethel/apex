"use client";

import {useActionState,useId,useState} from "react";
import {summarizeReviewAllocations}
 from "@/lib/supplier/review-only-fulfillment-state.mjs";
import {saveHeldShipmentPlan,type PlanActionState} from "./held-shipment-plan-actions";

type ReviewLine={
 id:string;lineNumber:number;sku:string;title:string;variant:string;
 quantity:number;unitPriceCents:number;subtotalCents:number;
};
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);

type PlanForm={
 storeId:string;orderId:string;requestId:string;plannedQuantities:Record<string,number>;
};
const initial:PlanActionState={message:""};

export function HeldOrderLineReview({lines,planForm}:{
 lines:ReviewLine[],planForm?:PlanForm,
}){
 const [entered,setEntered]=useState<Record<string,string>>({});
 const [result,submit,pending]=useActionState(saveHeldShipmentPlan,initial);
 const formId=useId();
 const rows=lines.map(line=>({
  lineId:line.id,purchasedQuantity:line.quantity,
  plannedQuantity:planForm?.plannedQuantities[line.id]??0,
  newPlanQuantity:Number(entered[line.id]??"0"),
 }));
 const preview=rows.length?summarizeReviewAllocations(rows):null;
 return <section className="apex-orders-line-review" aria-label="Original purchased items">
  <h3>Original purchase lines</h3>
  <p className="notice">These are saved purchase-time item details, not
   current catalog prices or supplier inventory.</p>
  {!lines.length?<p role="status">No saved line snapshots exist
   for this original held order.</p>:<>
   <div className="apex-orders-line-list">
    {lines.map(line=>{
     const planned=planForm?.plannedQuantities[line.id]??0;
     const remaining=line.quantity-planned;
     return <article key={line.id} className="apex-orders-line">
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
     <label htmlFor={"review-line-"+line.id}>
      {planForm?"Units in this review plan":"Quantity to preview"}
     </label>
     <input id={"review-line-"+line.id} type="number" inputMode="numeric"
      form={planForm?formId:undefined} name={planForm?`qty:${line.id}`:undefined}
      min={0} max={remaining} step={1} disabled={pending||remaining===0}
      value={entered[line.id]??"0"}
      onChange={e=>setEntered(v=>({...v,[line.id]:e.target.value}))}
      aria-describedby={"review-line-note-"+line.id}/>
     <small id={"review-line-note-"+line.id}>
      {planForm?`${planned} in saved plans · ${remaining} available to plan`:
       "Preview only. Changes stay in your browser."}
     </small>
    </article>})}
   </div>
   {preview?<p className="apex-orders-preview-summary" role="status">
    {preview.requestedUnits} units selected · {preview.remainingUnplannedUnits} available after this selection.
    {!planForm&&" No quantity changes have been saved."}
   </p>:<p className="apex-orders-warning" role="alert">
    Invalid quantity selection. Enter a whole number between 0 and the
    available quantity for each line.
   </p>}
   {planForm&&<form id={formId} action={submit}>
    <input type="hidden" name="store_id" value={planForm.storeId}/>
    <input type="hidden" name="order_id" value={planForm.orderId}/>
    <input type="hidden" name="request_id" value={planForm.requestId}/>
    <button className="button" disabled={pending||!preview?.requestedUnits}>
     {pending?"Saving…":"Save review plan"}
    </button>
    {result.message&&<p className="notice" role={result.error?"alert":"status"}>{result.message}</p>}
   </form>}
  </>}
  {planForm&&<p className="notice">Saved plans use purchase quantities for internal review only.
   The order remains held.</p>}
 </section>;
}
