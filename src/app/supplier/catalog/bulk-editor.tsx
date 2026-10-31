"use client";

import Link from "next/link";
import {useMemo,useState,useTransition} from "react";
import {saveBulkProductDrafts} from "./bulk-actions";

export type BulkEditRow={
 key:string;id?:string;name:string;sku:string;description:string;
 price:string;comparePrice:string;categoryId:string;isActive:boolean;
};
type Category={id:string;name:string};

function newRow():BulkEditRow{
 return {key:crypto.randomUUID(),name:"",sku:"",description:"",
  price:"",comparePrice:"",categoryId:"",isActive:false};
}
export function BulkDraftEditor({storeId,editable,initialRows,categories}:{
 storeId:string;editable:boolean;initialRows:BulkEditRow[];categories:Category[];
}){
 const [rows,setRows]=useState<BulkEditRow[]>(initialRows);
 const [selected,setSelected]=useState<string[]>([]);
 const [lastSave,setLastSave]=useState<{[key:string]:{ok:boolean;message:string}}>({});
 const [result,setResult]=useState({ok:false,message:"",results:[] as {key:string;ok:boolean;name:string;message:string;id?:string;sku?:string}[]});
 const [pending,startTransition]=useTransition();
 const selectedSet=useMemo(()=>new Set(selected),[selected]);
 const selectedRows=rows.filter(r=>selectedSet.has(r.key));
 const savedSelected=selectedRows.filter(r=>Boolean(r.id));
 const selectedIds=savedSelected.map(r=>r.id!);
 const previewSelected=selectedIds.length&&selectedIds.length<=50
  ?"/supplier/catalog/bulk/preview?ids="+encodeURIComponent(selectedIds.join(","))
  :null;

 function saveSelected(formData:FormData){
  startTransition(async()=>{
   const outcome=await saveBulkProductDrafts({ok:false,message:"",results:[]},formData);
   setResult(outcome);
   setLastSave(prev=>({...prev,...Object.fromEntries(outcome.results.map(r=>[
    r.key,{ok:r.ok,message:r.message}
   ]))}));
   setRows(prev=>prev.map(r=>{
    const saved=outcome.results.find(o=>o.key===r.key&&o.ok&&o.id);
    return saved?{...r,id:saved.id,sku:saved.sku||r.sku}:r;
   }));
  });
 }

 function change(key:string,field:keyof BulkEditRow,value:string|boolean){
  setRows(prev=>prev.map(r=>r.key===key?{...r,[field]:value}:r));
  setLastSave(prev=>{const copy={...prev};delete copy[key];return copy;});
 }
 function toggle(key:string){
  setSelected(prev=>prev.includes(key)?prev.filter(x=>x!==key):[...prev,key]);
 }
 function addRows(count:number){
  if(!editable||rows.length+count>120)return;
  const added=Array.from({length:count},()=>newRow());
  setRows(prev=>[...prev,...added]);
  setSelected(prev=>[...prev,...added.map(r=>r.key)]);
 }
 function removeUnsaved(key:string){
  setRows(prev=>prev.filter(r=>r.key!==key));setSelected(prev=>prev.filter(k=>k!==key));
 }
 const selectedValid=selectedRows.length>0&&selectedRows.length<=20;
 const allSelected=rows.length>0&&selected.length===rows.length;

 return <section className="apex-bulk-workspace" aria-label="Bulk product creation and editing">
  <div className="apex-bulk-toolbar">
   <button type="button" className="button secondary" onClick={()=>addRows(1)}
    disabled={!editable||rows.length>=120}>+ Add product</button>
   <button type="button" className="button secondary" onClick={()=>addRows(5)}
    disabled={!editable||rows.length>115}>+ Add 5 products</button>
   <button type="button" className="button secondary" onClick={()=>
    setSelected(allSelected?[]:rows.map(r=>r.key))}>
    {allSelected?"Clear selection":"Select all"}
   </button>
  </div>
  <p className="notice">Edit several products together. Check the rows to save, then preview one or all saved offers. Save up to 20 changes per batch.</p>
  <div className="apex-bulk-rows">
   {rows.map((r,i)=>{
    const status=lastSave[r.key];
    return <article key={r.key} className="apex-bulk-row">
     <div className="apex-bulk-row-title">
      <label className="apex-bulk-select">
       <input type="checkbox" checked={selectedSet.has(r.key)}
        onChange={()=>toggle(r.key)} aria-label={"Select "+(r.name||"new product "+(i+1))}/>
       <strong>{r.name||"New product "+(i+1)}</strong>
      </label>
      <span>{r.id?"Saved product":"Not saved"}</span>
     </div>
     <div className="apex-bulk-fields">
      <label>Name<input value={r.name} maxLength={120}
       disabled={!editable} onChange={e=>change(r.key,"name",e.target.value)}/></label>
      <label>SKU <small>(optional for new)</small><input value={r.sku}
       maxLength={60} disabled={!editable}
       onChange={e=>change(r.key,"sku",e.target.value)}/></label>
      <label>Price (USD)<input type="number" min="0" max="9999999.99"
       step=".01" value={r.price} disabled={!editable}
       onChange={e=>change(r.key,"price",e.target.value)}/></label>
      <label>Compare-at <small>(optional)</small><input type="number"
       min="0" max="9999999.99" step=".01" value={r.comparePrice}
       disabled={!editable} onChange={e=>change(r.key,"comparePrice",e.target.value)}/></label>
      <label>Category<select value={r.categoryId} disabled={!editable}
       onChange={e=>change(r.key,"categoryId",e.target.value)}>
       <option value="">Uncategorized</option>
       {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label className="apex-bulk-active">
       <input type="checkbox" checked={r.isActive}
        disabled={!editable} onChange={e=>change(r.key,"isActive",e.target.checked)}/>
       Active in private catalog
      </label>
      <label className="apex-bulk-description">Description
       <textarea value={r.description} rows={2} maxLength={1500} disabled={!editable}
        onChange={e=>change(r.key,"description",e.target.value)}/></label>
     </div>
     <div className="apex-bulk-row-footer">
      {status?<p role="status" className={status.ok?"apex-bulk-saved":"apex-bulk-error"}>
       {status.ok?"✓ Saved":"Not saved"} — {status.message}</p>
       :<p className="notice">Select to include in your next save.</p>}
      <div className="actions">
       {r.id&&<Link className="button secondary" href={"/supplier/catalog/preview/"+r.id}>
        Preview single
       </Link>}
       {!r.id&&<button type="button" className="button secondary"
        onClick={()=>removeUnsaved(r.key)}>Remove unsaved</button>}
      </div>
     </div>
    </article>;
   })}
  </div>
  <div className="apex-bulk-footer">
   <form action={saveSelected}>
    <input type="hidden" name="storeId" value={storeId}/>
    <input type="hidden" name="rows" value={JSON.stringify(selectedRows)}/>
    <button type="submit" className="button primary" disabled={!editable||pending||!selectedValid}>
     {pending?"Saving…":"Save selected ("+selectedRows.length+")"}
    </button>
   </form>
   {previewSelected?<Link className="button secondary" href={previewSelected}>
     Preview selected ({selectedIds.length})
    </Link>:<span className="notice">Select saved products to preview together.</span>}
   <Link className="button secondary" href="/supplier/catalog/bulk/preview?all=1">
    Preview all saved
   </Link>
  </div>
  {selectedRows.length>20&&<p role="status" className="notice">
   Save products in groups of 20. {selectedRows.length} rows currently selected.
  </p>}
  {result.message&&<p role="status" className="apex-bulk-result">{result.message}</p>}
 </section>;
}
