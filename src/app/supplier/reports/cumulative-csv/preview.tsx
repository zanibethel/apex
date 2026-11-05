"use client";
import {useState} from "react";
import {previewHeldReviewCsvs} from "@/lib/supplier/held-order-csv-preview.mjs";

type Preview={
 uploadedRows:number;uniqueUploadedOrders:number;duplicateIdentical:number;
 conflictingDuplicateIds:number;currentUniqueOrders:number;matching:number;
 staleOrChanged:number;unknown:number;notInUploadedFiles:number;
 originalToday:number;priorOriginal:number;reportDate:string|null;
 safe:boolean;reviewOnly:boolean;canImport:boolean;canShip:boolean;
};

export default function HeldCsvPreview({storeId}:{storeId:string}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [checking,setChecking]=useState(false);
 async function inspect(files:FileList|null){
  setPreview(null);setError(null);
  if(!files||files.length===0)return;
  if(files.length>4||Array.from(files).some(f=>
    f.size===0||f.size>800000||!f.name.toLowerCase().endsWith(".csv"))){
   setError("Select one to four CSV exports, each smaller than 800 KB.");
   return;
  }
  setChecking(true);
  try{
   const uploaded=await Promise.all(Array.from(files).map(f=>f.text()));
   const response=await fetch(
    "/api/supplier/held-order-export?store="+encodeURIComponent(storeId),
    {credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw new Error("Current authorized export unavailable.");
   const current=await response.text();
   setPreview(previewHeldReviewCsvs(uploaded,current,storeId));
  }catch(e){
   setError(e instanceof Error?e.message:"Unable to compare CSV exports.");
  }finally{setChecking(false);}
 }
 return <section className="supplier-panel" style={{maxWidth:"none",marginTop:16}}>
  <h3>Dry-run CSV overlap review</h3>
  <p>Compare up to four earlier exports with the latest authorized
   original-order metadata. Files are processed in your browser and
   are not uploaded or saved. Duplicate IDs are counted once.</p>
  <label htmlFor={"held-compare-"+storeId}>Choose earlier CSV files</label>
  <input id={"held-compare-"+storeId} type="file" multiple
   accept=".csv,text/csv" disabled={checking}
   onChange={e=>{void inspect(e.currentTarget.files);}}/>
  {checking&&<p role="status">Checking the latest authorized source…</p>}
  {error&&<p role="alert">{error} No records were changed.</p>}
  {preview&&<div aria-live="polite" role="status">
   <p><strong>{preview.uniqueUploadedOrders}</strong> unique uploaded IDs;
    {" "}<strong>{preview.duplicateIdentical}</strong> identical repeats;
    {" "}<strong>{preview.currentUniqueOrders}</strong> current unique IDs.</p>
   <p><strong>{preview.matching}</strong> matching original records;
    {" "}<strong>{preview.notInUploadedFiles}</strong> new or absent-from-file records;
    {" "}<strong>{preview.staleOrChanged+preview.unknown+
     preview.conflictingDuplicateIds}</strong> conflicting, stale or unknown IDs.</p>
   <p>Current Central report date: {preview.reportDate??"no records"}.
    {" "}{preview.originalToday} recorded on that date and
    {" "}{preview.priorOriginal} recorded earlier.</p>
   {!preview.safe&&<p role="alert">Conflicts found. Review the original
    records using a fresh export. No edits are applied.</p>}
   {preview.safe&&<p>Identity overlap check passed.
    Repeated records retain one original ID.</p>}
   <p className="notice">Read-only historical review.
    This does not establish independent payment, shipping eligibility,
    dispatch, or receipt of any package.</p>
  </div>}
 </section>;
}
