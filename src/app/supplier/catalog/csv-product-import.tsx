"use client";
import {useState} from "react";
import {buildProductCsv,parseProductCsv} from "@/lib/catalog/product-csv.mjs";
import {draftSkuFromUuid} from "@/lib/catalog/sku-format.mjs";
import type {BulkEditRow} from "./bulk-editor";
type Category={id:string;name:string};
type ImportRow={key:string;line:number;row:BulkEditRow;issue?:string};
function saveCsv(body:string){
 const url=URL.createObjectURL(new Blob(["\uFEFF",body],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="apex-private-products.csv";
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
export function CsvProductImport({rows,categories,disabled,onLoad}:{
 rows:BulkEditRow[];categories:Category[];disabled:boolean;onLoad:(rows:BulkEditRow[])=>void;
}){
 const [staged,setStaged]=useState<ImportRow[]>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [message,setMessage]=useState("");
 const [fileName,setFileName]=useState("");
 async function upload(file?:File){
  setStaged([]);setErrors([]);setMessage("");setFileName(file?.name??"");
  if(!file)return;
  if(!file.name.toLowerCase().endsWith(".csv")||file.size<1||file.size>256000){
   setErrors(["Choose a .csv file up to 256 KB."]);return;
  }
  let parsed;
  try{parsed=parseProductCsv(await file.text());}
  catch{setErrors(["Unable to parse CSV file."]);return;}
  setErrors(parsed.errors);
  const byId=new Map(rows.filter(r=>r.id).map(r=>[r.id!.toLowerCase(),r]));
  const bySku=new Map(rows.filter(r=>r.id&&r.sku).map(r=>[r.sku.toUpperCase(),r]));
  const byCategory=new Map(categories.map(c=>[c.name.trim().toLowerCase(),c.id]));
  const seen=new Set<string>();
  const mapped:ImportRow[]=parsed.rows.map((data,index)=>{
   const item=data as Record<string,string>&{line:number};
   const sku=(item.sku||"").trim().toUpperCase();
   const explicit=item.product_id?byId.get(item.product_id.toLowerCase()):undefined;
   const matched=sku?bySku.get(sku):undefined;
   const target=explicit||matched;
   let issue:string|undefined;
   if(item.product_id&&!explicit)issue="Product ID does not belong to this store.";
   if(explicit&&matched&&explicit.id!==matched.id)issue="Product ID and SKU identify different products.";
   const categoryName=(item.category||"").trim().toLowerCase();
   const categoryId=categoryName?byCategory.get(categoryName):target?.categoryId??"";
   if(categoryName&&!categoryId)issue="Unknown category. Add it first.";
   const id=target?.id??(sku?"sku:"+sku:"new:"+index);
   if(seen.has(id))issue="Duplicate product in CSV.";seen.add(id);
   const row:BulkEditRow={
    key:target?.key??crypto.randomUUID(),id:target?.id,
    name:item.title,sku:sku||target?.sku||draftSkuFromUuid(item.title,crypto.randomUUID()),
    description:item.description||target?.description||"",price:item.price,
    comparePrice:item.compare_at_price||target?.comparePrice||"",
    sourceCost:item.source_cost||target?.sourceCost||"",
    categoryId:categoryId||"",
    isActive:item.active?["true","yes","1"].includes(item.active.toLowerCase()):target?.isActive??false,
    linkedSource:target?.linkedSource??false,
   };
   if(row.linkedSource&&item.source_cost&&item.source_cost!==target?.sourceCost)
    issue="Linked source cost must be edited in Source review.";
   return {key:row.key,line:item.line,row,issue};
  });
  setStaged(mapped);
  const valid=mapped.filter(r=>!r.issue);
  const known=new Set(rows.map(r=>r.key));
  const additions=valid.filter(r=>!known.has(r.key)).length;
  if(rows.length+additions>250){
   setErrors(previous=>[...previous,"Too many products for this editor. Upload a smaller CSV."]);
   setMessage("No rows loaded. The editor supports up to 250 rows.");return;
  }
  if(valid.length)onLoad(valid.map(r=>r.row));
  setMessage(valid.length+" product "+(valid.length===1?"card":"cards")+
   " added to the editor below with SKUs filled in. Review the cards, then Save selected to create or update the private products.");
 }
 function exportSaved(){
  const items=rows.filter(r=>r.id).map(r=>({
   product_id:r.id,sku:r.sku,title:r.name,description:r.description,
   source_cost:r.sourceCost??"",price:r.price,compare_at_price:r.comparePrice,
   category:categories.find(c=>c.id===r.categoryId)?.name??"",
   active:r.isActive?"true":"false",
  }));
  saveCsv(buildProductCsv(items));
 }
 return <section className="apex-csv-panel" aria-label="CSV import and export">
  <div className="apex-csv-header">
   <div>
    <p className="eyebrow">CSV / BULK PRODUCTS</p>
    <h2>Download template or upload products</h2>
    <p className="notice">Title, description, source cost, price, compare-at price, SKU, category, active and optional product ID.</p>
   </div>
   <div className="apex-csv-downloads">
    <a href="/templates/apex-product-import-template.csv" download className="button secondary">Download CSV template</a>
    <button type="button" className="button secondary" disabled={!rows.some(r=>r.id)}
     onClick={exportSaved}>Export editor CSV</button>
   </div>
  </div>
  <p className="notice"><strong>Matching:</strong> product_id or SKU updates an existing private product; otherwise a new draft is created. Category uses the category name (GetSwole is a category, not a supplier). Blank source cost on updates preserves it. Images and inventory remain separate.</p>
  <label className="apex-csv-upload">Select CSV file
   <input type="file" accept=".csv,text/csv" disabled={disabled}
    onChange={e=>void upload(e.target.files?.[0])}/>
  </label>
  {fileName&&<p className="notice">Selected file: {fileName}</p>}
  {errors.length>0&&<div role="alert" className="apex-csv-errors">
   <strong>{errors.length} CSV issues</strong>
   <ul>{errors.slice(0,30).map((e,i)=><li key={i}>{e}</li>)}</ul>
  </div>}
  {staged.length>0&&<div className="apex-csv-review">
   <div className="apex-csv-review-toolbar">
    <strong>{staged.filter(r=>!r.issue).length} editable cards imported · {staged.filter(r=>r.issue).length} blocked</strong>
    <a className="button secondary" href="#bulk-product-cards">Review imported product cards</a>
   </div>
   <div className="apex-csv-review-list">
    {staged.map(item=><div key={item.key+":"+item.line} className="apex-csv-review-row">
     <span><strong>Line {item.line}: {item.row.name}</strong>
      <small>{item.issue?"Not imported":item.row.id?"Existing product card updated in editor":"New product draft card created"} · SKU {item.row.sku} · Price {item.row.price}</small>
      {item.issue&&<small className="apex-bulk-error">{item.issue}</small>}
     </span>
    </div>)}
   </div>
  </div>}
  {message&&<p role="status" className="apex-csv-status">{message}</p>}
  <p className="notice">CSV maximum: 100 rows / 256 KB. Valid rows automatically become editable cards with SKUs assigned. Review them, then use Save selected to store drafts. Uploading never publishes or charges customers.</p>
 </section>;
}
