"use client";

import {useState} from "react";
import {
 previewCumulativeReviewImport,
 applyCumulativeReviewPreviewLocally,
 serializeCumulativeReviewErrorCsv,
} from "@/lib/supplier/cumulative-fulfillment-review-csv.mjs";

type Issue={line:number;code:string;key?:string};
type Preview={
 status:string;uploadedRows:number;uniqueRows:number;
 uniqueOrders:number;duplicatesInFile:number;staleRows:number;
 changedRows:number;unchangedRows:number;alreadyRecordedRows:number;
 conflicts:number;issues:readonly Issue[];proposedChanges:readonly unknown[];
 databaseUpdated:boolean;fulfillmentUpdated:boolean;
 canShip:boolean;canUploadToDatabase?:boolean;
};
type Props={
 storeId:string;previousCsv:string;currentCsv:string;
 staleCsv:string;freshCsv:string;currentRows:readonly Record<string,string>[];
};

function download(name:string,content:string){
 const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 try{
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;
  document.body.append(anchor);anchor.click();anchor.remove();
 }finally{
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
export default function FulfillmentQaWorkbench(p:Props){
 const [rows,setRows]=useState<readonly Record<string,string>[]>(p.currentRows);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [error,setError]=useState("");
 const [processed,setProcessed]=useState("");
 const [source,setSource]=useState("");
 const [loading,setLoading]=useState(false);
 function inspect(csv:string,description:string){
  setError("");setProcessed("");setPreview(null);setSource(description);
  try{
   const result=previewCumulativeReviewImport(csv,rows,p.storeId) as Preview;
   if(result.databaseUpdated!==false||result.canShip!==false||
    result.fulfillmentUpdated!==false)throw Error("Unsafe QA receipt");
   setPreview(result);
  }catch{
   setError("CSV was rejected before preview. No database records changed.");
  }
 }
 async function upload(file:File|undefined){
  setError("");setPreview(null);
  if(!file)return;
  if(file.size===0||file.size>750000||
   !file.name.toLowerCase().endsWith(".csv")){
   setError("Use a CSV under 750 KB.");
   return;
  }
  setLoading(true);
  try{inspect(await file.text(),"Uploaded local CSV");}
  catch{setError("File could not be read.");}
  finally{setLoading(false);}
 }
 function simulate(){
  if(!preview||preview.status!=="preview_only")return;
  try{
   const updated=applyCumulativeReviewPreviewLocally(rows,preview);
   setRows(updated);
   setProcessed("Applied changes to this browser-only QA scenario. "+
    "No database, order, or shipment records were changed. "+
    "Run the same fresh-edit sample again to verify duplicate-safe replay.");
   setPreview(null);
  }catch{setError("Local scenario update rejected.");}
 }
 function reset(){
  setRows(p.currentRows);setPreview(null);setError("");
  setSource("");setProcessed("Synthetic scenario reset.");
 }
 return <section className="supplier-panel" style={{maxWidth:"none",marginTop:18}}>
  <h2>CSV overlap and replay workbench</h2>
  <p className="notice">All data below is synthetic, processed in your browser,
   and isolated from production. No upload API, customer address access,
   payment settlement, tracking submission or label purchase is invoked.</p>
  <div className="actions" style={{flexWrap:"wrap"}}>
   <button type="button" className="button secondary" onClick={()=>
    download("apex-track3-day3-20-orders.csv",p.previousCsv)}>
    Download Day 3 · 20 orders
   </button>
   <button type="button" className="button secondary" onClick={()=>
    download("apex-track3-day4-40-orders.csv",p.currentCsv)}>
    Download Day 4 · 40 orders
   </button>
   <button type="button" className="button secondary" onClick={()=>
    download("apex-track3-day3-stale-10.csv",p.staleCsv)}>
    Download 10 stale edits
   </button>
   <button type="button" className="button secondary" onClick={()=>
    download("apex-track3-day4-fresh-10.csv",p.freshCsv)}>
    Download 10 valid edits
   </button>
  </div>
  <div className="actions" style={{marginTop:12,flexWrap:"wrap"}}>
   <button className="button primary" type="button" onClick={()=>
    inspect(p.staleCsv,"Stale Day 3 edits")}>
    Check stale edits
   </button>
   <button className="button secondary" type="button" onClick={()=>
    inspect(p.freshCsv,"Valid Day 4 edits")}>
    Check valid edits
   </button>
   <button className="button secondary" type="button" onClick={reset}>
    Reset scenario
   </button>
  </div>
  <label htmlFor="apex-track3-local-csv" style={{display:"block",marginTop:14}}>
   Compare your locally edited CSV to the current synthetic snapshot
  </label>
  <input id="apex-track3-local-csv" type="file" accept=".csv,text/csv"
   disabled={loading} onChange={e=>{void upload(e.currentTarget.files?.[0]);}}/>
  {loading&&<p role="status">Validating the selected CSV…</p>}
  {error&&<p role="alert">{error}</p>}
  {processed&&<p role="status">{processed}</p>}
  {preview&&<div aria-live="polite">
   <h3 style={{marginTop:16}}>{source}</h3>
   <p role={preview.status==="rejected"?"alert":"status"}>
    <strong>{preview.status==="rejected"?"Rejected without changes":
     "Review-only preview accepted"}</strong>
   </p>
   <dl style={{display:"grid",gap:12,
    gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))"}}>
    {([
     ["Uploaded rows",preview.uploadedRows],
     ["Unique orders",preview.uniqueOrders],
     ["Identical duplicate rows",preview.duplicatesInFile],
     ["Stale rows",preview.staleRows],
     ["Proposed changes",preview.changedRows],
     ["Unchanged rows",preview.unchangedRows],
     ["Conflicts",preview.conflicts],
    ] as [string,number][]).map(([label,value])=>
     <div key={label} style={{padding:12,border:"1px solid #5a4050",borderRadius:9}}>
      <dt style={{fontSize:12}}>{label}</dt>
      <dd style={{fontSize:24,fontWeight:700,margin:0}}>{value}</dd>
     </div>)}
   </dl>
   {preview.issues.length>0&&<>
    <p role="alert">Original purchase and source fields are immutable.
     Correct conflicts against a fresh snapshot before retrying.</p>
    <button className="button secondary" type="button" onClick={()=>
     download("apex-track3-csv-conflicts.csv",
      serializeCumulativeReviewErrorCsv(preview))}>
     Download conflict report
    </button>
   </>}
   {preview.status==="preview_only"&&preview.changedRows>0&&
    <button className="button secondary" type="button" onClick={simulate}>
     Apply to browser-only simulation
    </button>}
   <p className="notice">Production changed: no · Shipment authorized:
    no · Postage purchased: no.</p>
  </div>}
 </section>;
}
