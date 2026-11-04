"use client";
import {useState} from "react";
import {parseSalesReviewImport,serializeSalesReviewCsv}
 from "@/lib/supplier/sales-reconciliation-csv.mjs";
import {importVerifiedSalesReviewCsv} from "./actions";

type SaleRow={
 order_reference:string;purchased_at_utc:string;sale_state:string;
 gross_cents:string;review_state:string;review_note:string;version:number;
};
type Preview={uniqueOrders:number;duplicatesInFile:number;
 changed:number;unchanged:number;stale:number};
const money=(value:string)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(Number(value)/100);
const timestamp=(date:string)=>new Date(date).toLocaleString("en-US",{
 dateStyle:"medium",timeStyle:"short",timeZone:"America/Chicago",
});
export default function SalesReconciliationWorkspace({
 storeId,rows,total,truncated,canEdit,
}:{storeId:string;rows:SaleRow[];total:number;truncated:boolean;canEdit:boolean}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [selected,setSelected]=useState(false);
 const byOrder=new Map(rows.map(r=>[r.order_reference,r]));
 async function inspectFile(file:File|null){
  setError(null);setPreview(null);setSelected(false);
  if(!file)return;
  if(file.size<1||file.size>250000){
   setError("Choose a CSV smaller than 250 KB.");return;
  }
  try{
   const result=parseSalesReviewImport(await file.text(),storeId);
   let changed=0,unchanged=0,stale=0;
   for(const uploaded of result.rows){
    const current=byOrder.get(uploaded.order_reference);
    if(!current||current.purchased_at_utc!==uploaded.purchased_at_utc||
     current.sale_state!==uploaded.sale_state||
     current.gross_cents!==uploaded.gross_cents){
     stale++;continue;
    }
    if(current.review_state===uploaded.review_state&&
     current.review_note===uploaded.review_note)unchanged++;
    else if(current.version!==uploaded.version)stale++;
    else changed++;
   }
   setPreview({...result,changed,unchanged,stale});
   setSelected(true);
   if(stale)setError("Some rows are unknown or outdated. Download a fresh file; no upload is allowed until all rows match.");
  }catch(e){
   setError(e instanceof Error?e.message:"Invalid CSV report");
  }
 }
 function download(){
  try{
   const csv=serializeSalesReviewCsv(rows,storeId);
   const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   a.href=url;a.download="apex-verified-sales-review-"+new Date().toISOString().slice(0,10)+".csv";
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{
   setError("Unable to prepare a safe export.");
  }
 }
 return <section className="apex-sales-review">
  <div className="apex-sales-review-metrics">
   <article><span>Verified sales records</span><strong>{total}</strong></article>
   <article><span>Needs review</span><strong>{
    rows.filter(x=>x.review_state==="unreviewed").length}</strong></article>
   <article><span>Reviewed</span><strong>{
    rows.filter(x=>x.review_state==="reviewed").length}</strong></article>
   <article><span>Needs attention</span><strong>{
    rows.filter(x=>x.review_state==="needs_attention").length}</strong></article>
  </div>
  <div className="apex-sales-review-box">
   <h2>Export verified sales review</h2>
   <p>Download the current sales history to review offline. Each sale has
    a permanent order reference, original purchase timestamp, payment state,
    recorded amount and editable review note/status.</p>
   <button type="button" className="button primary" onClick={download}
    disabled={!rows.length||truncated}>Download CSV</button>
   {truncated&&<p role="alert">There are more than 500 verified records.
    Export is paused rather than silently omitting sales.</p>}
   {!total&&<p role="status">No verified sales exist yet. Nothing will be fabricated.</p>}
  </div>
  <div className="apex-sales-review-box">
   <h2>Upload revised review CSV</h2>
   <p>Edit only <strong>review_state</strong> and <strong>review_note</strong>.
    Accepted states are unreviewed, reviewed and needs_attention.
    Original references, purchase dates, amounts and versions must be preserved.
    These annotations do not indicate shipped or fulfilled.</p>
   <form action={importVerifiedSalesReviewCsv}>
    <input type="hidden" name="storeId" value={storeId}/>
    <label htmlFor={"apex-sales-file-"+storeId}>Upload CSV file</label>
    <input id={"apex-sales-file-"+storeId} name="file" type="file"
     accept=".csv,text/csv" required disabled={!canEdit||truncated||!rows.length}
     onChange={e=>inspectFile(e.target.files?.[0]??null)}/>
    {preview&&<div className="apex-sales-review-preview" role="status">
     <p><strong>{preview.uniqueOrders}</strong> unique references,
      <strong> {preview.duplicatesInFile}</strong> repeated identical rows,
      <strong> {preview.changed}</strong> proposed review changes,
      <strong> {preview.unchanged}</strong> already matching,
      <strong> {preview.stale}</strong> conflicts.</p>
    </div>}
    {error&&<p role="alert" className="apex-sales-review-error">{error}</p>}
    <button type="submit" className="button primary"
     disabled={!canEdit||truncated||!selected||!preview||preview.stale>0}>
     Import reviewed records
    </button>
   </form>
   {!canEdit&&<p className="notice">Only a supplier owner or manager can import changes.</p>}
   <p className="notice">The server rechecks every row against verified order history and
    applies the batch atomically. No duplicate orders can be created.</p>
  </div>
  <section className="apex-sales-review-box">
   <h2>Authoritative purchase history</h2>
   <p>Originally purchased dates remain fixed. Older records are emphasized so
    a repeated reference in a later report is not mistaken for a new sale.</p>
   {rows.length?<div className="apex-sales-review-scroll">
    <table><thead><tr>
     <th scope="col">Purchased (Central)</th>
     <th scope="col">Permanent reference</th>
     <th scope="col">Payment state</th>
     <th scope="col">Gross</th>
     <th scope="col">Review</th><th scope="col">Version</th>
    </tr></thead><tbody>{rows.map(row=>{
     const ageHours=(Date.now()-Date.parse(row.purchased_at_utc))/(3600*1000);
     return <tr key={row.order_reference}>
      <td>{timestamp(row.purchased_at_utc)}
       {ageHours>=48&&<span className="apex-sales-review-older">Older purchase</span>}</td>
      <td><code>{row.order_reference}</code></td>
      <td>{row.sale_state}</td>
      <td>{money(row.gross_cents)}</td>
      <td>{row.review_state.replaceAll("_"," ")}</td>
      <td>{row.version}</td>
     </tr>;
    })}</tbody></table>
   </div>:<p>No recorded sales to review.</p>}
  </section>
 </section>;
}
