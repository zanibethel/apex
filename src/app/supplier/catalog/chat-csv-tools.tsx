"use client";

import {useState,type ChangeEvent} from "react";
import Link from "next/link";
import {parseProductCsv} from "@/lib/catalog/product-csv.mjs";

type Preview={
 ok:true;rowCount:number;newCount:number;skippedCount:number;
 preview:{name:string;sku:string;price:string}[];
 answer:string;
};
type ImportResult={
 ok:boolean;created?:number;skipped?:number;failed?:{name:string;message:string}[];
 processed?:number;nextOffset?:number;total?:number;error?:string;
 conflicts?:{sku:string;reason:string}[];errors?:string[];
};
export function SupplierChatCsvTools({uploadEnabled=false}:{uploadEnabled?:boolean}){
 const [fileName,setFileName]=useState("");
 const [csvText,setCsvText]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [errors,setErrors]=useState<string[]>([]);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [complete,setComplete]=useState(false);
 const [progress,setProgress]=useState(0);
 async function request(operation:"preview"|"import",text:string,batchOffset=0){
  const response=await fetch("/api/assistant/supplier/csv",{
   method:"POST",headers:{"Content-Type":"application/json"},
   cache:"no-store",body:JSON.stringify({operation,csvText:text,batchOffset}),
  });
  const data=await response.json() as ImportResult&Partial<Preview>;
  if(!response.ok)throw new Error([
   data.error??"Unable to process CSV.",
   ...(Array.isArray(data.errors)?data.errors.slice(0,8):[]),
   ...(Array.isArray(data.conflicts)?data.conflicts.slice(0,8).map(x=>x.sku+": "+x.reason):[]),
  ].join("\n"));
  return data;
 }
 async function chooseFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  setFileName(file?.name??"");setCsvText("");setPreview(null);
  setErrors([]);setStatus("");setComplete(false);setProgress(0);
  if(!file)return;
  if(!file.name.toLowerCase().endsWith(".csv")||file.size<1||file.size>256000){
   setErrors(["Select a CSV file no larger than 256 KB."]);return;
  }
  setBusy(true);
  try{
   const text=await file.text();
   const parsed=parseProductCsv(text);
   if(parsed.errors.length){setErrors(parsed.errors.slice(0,15));return;}
   if(!parsed.rows.length){setErrors(["CSV is empty."]);return;}
   const result=await request("preview",text);
   if(!result.ok||!Number.isSafeInteger(result.rowCount))throw new Error("Unable to validate CSV.");
   setCsvText(text);
   setPreview(result as Preview);
   setStatus(result.answer??"Review the file, then confirm the private draft import.");
  }catch(error){
   setErrors([error instanceof Error?error.message:"Unable to read this CSV."]);
  }finally{setBusy(false);}
 }
 async function confirm(){
  if(!preview||!csvText||busy||complete)return;
  setBusy(true);setErrors([]);
  let created=0,skipped=0;
  try{
   for(let offset=0;offset<preview.rowCount;offset+=20){
    const result=await request("import",csvText,offset);
    created+=result.created??0;skipped+=result.skipped??0;
    setProgress(Math.min(preview.rowCount,offset+(result.processed??20)));
    if(!result.ok||(result.failed?.length??0)>0)
     throw new Error("Some items could not be saved: "+(result.failed??[]).slice(0,5)
      .map(x=>x.name+" ("+x.message+")").join("; "));
   }
   setComplete(true);
   setStatus(created+" products created as private drafts; "+skipped+
    " matching SKUs skipped. No products were published publicly and no BTCPay charges occurred.");
  }catch(error){
   setStatus(created+" created, "+skipped+" skipped before the issue. Re-upload the same file to retry without duplicating saved SKUs.");
   setErrors([error instanceof Error?error.message:"CSV import could not finish."]);
  }finally{setBusy(false);}
 }
 return <div className="apex-assistant-csv" aria-label="Supplier CSV catalog tools">
  <a href="/templates/apex-product-import-template.csv" download="apex-product-import-template.csv"
   className="apex-assistant-csv-link">Download CSV template</a>
  {uploadEnabled&&<>
   <p>Upload up to 100 rows (256 KB). Provide a unique SKU, title and price. Existing matching SKUs are skipped; updates belong in the full Products editor.</p>
   <label className="apex-assistant-csv-picker">
    Choose CSV file
    <input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{void chooseFile(e);}}/>
   </label>
   {fileName&&<p className="apex-assistant-csv-muted">Selected: {fileName}</p>}
   {preview&&<div className="apex-assistant-csv-preview">
    <strong>{preview.rowCount} rows · {preview.newCount} new · {preview.skippedCount} existing</strong>
    <ul>{preview.preview.map((p,i)=><li key={p.sku+String(i)}>
     {p.name} · {p.sku} · ${p.price}
    </li>)}</ul>
    <p>All saved products will be private drafts, with zero starting stock. Importing does not publish listings.</p>
    {!complete&&<button type="button" disabled={busy} onClick={()=>{void confirm();}}>
     {busy?"Importing…":"Confirm import of "+preview.rowCount+" rows"}
    </button>}
   </div>}
   {progress>0&&<p className="apex-assistant-csv-muted">Processed {progress} of {preview?.rowCount??"?"} rows.</p>}
   {status&&<p role="status">{status}</p>}
   {errors.length>0&&<div role="alert" className="apex-assistant-csv-errors">
    {errors.slice(0,12).map((e,i)=><p key={i}>{e}</p>)}
   </div>}
   <Link href="/supplier/catalog/bulk#apex-csv-tools" className="apex-assistant-csv-link">
    Open full CSV editor for updates and images
   </Link>
  </>}
 </div>;
}
