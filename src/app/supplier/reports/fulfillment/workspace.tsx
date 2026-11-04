"use client";

import {useState} from "react";
import {
 serializeCumulativeReviewCsv,previewCumulativeReviewImport,
 serializeCumulativeReviewErrorCsv,
} from "@/lib/supplier/cumulative-fulfillment-review-csv.mjs";

type RecordRow=Record<string,string>;
type ReviewPreview={
 status:string;uploadedRows:number;uniqueRows:number;uniqueOrders:number;
 duplicatesInFile:number;staleRows:number;changedRows:number;
 unchangedRows:number;alreadyRecordedRows:number;conflicts:number;
 databaseUpdated:boolean;issues:Array<{line:number;key:string;code:string}>;
};
function downloadCsv(csv:string,name:string){
 const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
 const href=URL.createObjectURL(blob);
 const link=document.createElement("a");
 link.href=href;link.download=name;
 document.body.appendChild(link);
 link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export default function CumulativeReviewWorkspace({
 storeId,day,rows,totalOrders,canPreview,
 summary,
}:{
 storeId:string;day:string;rows:RecordRow[];totalOrders:number;
 canPreview:boolean;
 summary:{newToday:number;carriedForward:number;
  partiallyPlanned:number;fullyPlannedReview:number;
  unplanned:number;incomplete:number;shipped:number;completed:number};
}){
 const [preview,setPreview]=useState<ReviewPreview|null>(null);
 const [error,setError]=useState("");
 const [reading,setReading]=useState(false);
 const shortStore=storeId.slice(0,8);
 function exportCurrent(){
  try{
   downloadCsv(serializeCumulativeReviewCsv(rows,storeId),
    "apex-fulfillment-review-"+shortStore+"-"+day+".csv");
  }catch{
   setError("Cannot export this incomplete or inconsistent review snapshot.");
  }
 }
 async function inspectCsv(file:File|undefined){
  setPreview(null);setError("");
  if(!file)return;
  if(file.size>750000||file.size===0){
   setError("CSV must be nonempty and no larger than 750 KB.");return;
  }
  setReading(true);
  try{
   const text=await file.text();
   const result=previewCumulativeReviewImport(text,rows,storeId);
   setPreview(result);
  }catch{
   setError("CSV rejected. Use a fresh file from this storefront and keep original order, line, shipment and revision fields unchanged.");
  }finally{setReading(false);}
 }
 const classes="supplier-panel";
 return <section className={classes} style={{maxWidth:"none",marginTop:14}}>
  <h3>Cumulative fulfillment review</h3>
  <p className="notice">Complete store-scoped review snapshot:
   {" "}{totalOrders} orders, {rows.length} item, plan and incomplete records.
   No customer delivery details are exported. This is NOT a shipping or
   payment authorization.</p>
  <div style={{display:"grid",
   gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
   {[
    ["New on date",summary.newToday],
    ["Carried forward",summary.carriedForward],
    ["Partially planned",summary.partiallyPlanned],
    ["Fully planned (not shipped)",summary.fullyPlannedReview],
    ["Not yet planned",summary.unplanned],
    ["Incomplete source",summary.incomplete],
   ].map(([label,count])=><article key={label}
    className="supplier-panel" style={{padding:12}}>
    <span className="eyebrow">{label}</span>
    <p style={{fontSize:24,margin:"6px 0 0",fontWeight:700}}>{count}</p>
   </article>)}
  </div>
  <p className="notice">Completed shipments: {summary.completed}.
   Shipped shipments: {summary.shipped}. Neither state can be
   independently verified by the held-order source yet.</p>
  <button type="button" className="button secondary"
   onClick={exportCurrent}>Download review CSV</button>
  <p className="notice">Only <strong>review_state</strong> and
   <strong> review_note</strong> are intended for offline edits. These are
   annotations, not shipping updates. Never put customer addresses, phone
   numbers or payment credentials in review notes.</p>
  <div style={{overflowX:"auto",maxHeight:420,marginTop:12}}>
   <table style={{minWidth:780,width:"100%"}}>
    <thead><tr><th scope="col">Original order</th>
     <th scope="col">Record</th><th scope="col">Item / plan</th>
     <th scope="col">Purchased</th><th scope="col">Planned</th>
     <th scope="col">Unplanned</th><th scope="col">Revision</th>
    </tr></thead>
    <tbody>{rows.slice(0,35).map(r=><tr key={
     r.row_kind+":"+r.order_id+":"+r.line_number+":"+r.shipment_id}>
     <td>{r.order_reference}</td><td>{r.row_kind.replaceAll("_"," ")}</td>
     <td>{r.row_kind==="order_line"?r.item_title:
      r.row_kind==="shipment_plan"?r.shipment_reference:"Source incomplete"}</td>
     <td>{r.purchased_quantity||"—"}</td>
     <td>{r.planned_quantity||"—"}</td>
     <td>{r.unplanned_quantity||"—"}</td>
     <td>{r.source_revision}</td>
    </tr>)}</tbody>
   </table>
  </div>
  {rows.length>35&&<p className="notice">Showing 35 of {rows.length}
   records here. Download includes all reviewed rows.</p>}
  {canPreview?<div className="supplier-panel"
   style={{maxWidth:"none",marginTop:16,padding:14}}>
   <h3>Preview an updated CSV</h3>
   <p className="notice">Upload here for validation and a conflict report
    only. No changes are saved to Apex. The original order and shipment
    identities cannot be overwritten by a CSV.</p>
   <label htmlFor={"fulfillment-review-csv-"+shortStore}>
    Choose revised review CSV</label>
   <input id={"fulfillment-review-csv-"+shortStore}
    type="file" accept=".csv,text/csv" disabled={reading}
    onChange={event=>void inspectCsv(event.currentTarget.files?.[0])}/>
   {reading&&<p role="status">Checking proposed review annotations…</p>}
   {error&&<p role="alert">{error}</p>}
   {preview&&<div role={preview.status==="rejected"?"alert":"status"}>
    <p><strong>{preview.status==="rejected"?
     "File rejected — nothing applied":"Preview valid — nothing applied"}</strong></p>
    <p>Uploaded rows: {preview.uploadedRows}
     {" · "}Unique orders: {preview.uniqueOrders}
     {" · "}Identical duplicate rows: {preview.duplicatesInFile}</p>
    <p>Proposed annotation changes: {preview.changedRows}
     {" · "}Unchanged: {preview.unchangedRows}
     {" · "}Stale revisions: {preview.staleRows}
     {" · "}Conflicts: {preview.conflicts}</p>
    {preview.conflicts>0&&<>
     <p>At least one row failed. All proposed edits are rejected together.
      Download the conflict file and compare it with the latest snapshot.</p>
     <button type="button" className="button secondary"
      onClick={()=>downloadCsv(
       serializeCumulativeReviewErrorCsv(preview),
       "apex-review-conflicts-"+shortStore+".csv")}>
      Download conflict report</button>
    </>}
   </div>}
  </div>:<p className="notice">Offline review import preview is restricted
   to the storefront owner or manager.</p>}
 </section>;
}
