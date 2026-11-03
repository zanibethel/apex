"use client";
import {useRouter} from "next/navigation";
import {useState,useTransition} from "react";
import {saveSelectedTaxCollection} from "./actions";

export type TaxProductRule={
 id:string;name:string;sku:string;collectSalesTax:boolean;
};
export function TaxCollectionBulkPanel({storeId,products}:{
 storeId:string;products:ReadonlyArray<TaxProductRule>;
}){
 const [rows,setRows]=useState(products);
 const [selected,setSelected]=useState<string[]>([]);
 const [message,setMessage]=useState("");
 const [pending,start]=useTransition();
 const router=useRouter();
 const selectedSet=new Set(selected);
 async function apply(ids:string[],collect:boolean){
  if(pending||ids.length<1||ids.length>50||
   new Set(ids).size!==ids.length)return;
  const form=new FormData();
  form.set("storeId",storeId);
  form.set("productIds",ids.join(","));
  form.set("collectSalesTax",String(collect));
  start(async()=>{
   try{
    const result=await saveSelectedTaxCollection({ok:false,message:""},form);
    setMessage(result.message);
    if(result.ok){
     const updated=new Set(ids);
     setRows(current=>current.map(p=>updated.has(p.id)?
      {...p,collectSalesTax:collect}:p));
     setSelected([]);
     router.refresh();
    }
   }catch{setMessage("Tax configuration could not be verified. Refresh and retry.");}
  });
 }
 const allSelected=rows.length>0&&rows.every(r=>selectedSet.has(r.id));
 return <section className="supplier-panel" aria-label="Product sales tax collection"
  style={{maxWidth:"none"}}>
  <h2>Collect sales tax by product</h2>
  <p className="notice">Checked = marked for sales-tax collection; unchecked =
   marked as potentially non-taxable. Start with collection enabled.
   Final tax and any exemption depend on verified product classification
   and the buyer’s delivery jurisdiction.</p>
  <div className="actions">
   <button type="button" className="button secondary" disabled={pending||!rows.length}
    onClick={()=>setSelected(allSelected?[]:rows.map(r=>r.id))}>
    {allSelected?"Clear selection":"Select all"}
   </button>
   <button type="button" className="button secondary"
    disabled={pending||!selected.length||selected.length>50}
    onClick={()=>void apply(selected,true)}>Collect tax for selected ({selected.length})</button>
   <button type="button" className="button secondary"
    disabled={pending||!selected.length||selected.length>50}
    onClick={()=>void apply(selected,false)}>Do not collect tax for selected ({selected.length})</button>
  </div>
  <p className="notice">Select up to 50 products per update. Individual changes
   save immediately; batch changes apply only to checked selections.</p>
  <div style={{display:"grid",gap:8,marginTop:14}}>
   {rows.map(p=><div key={p.id} style={{display:"flex",flexWrap:"wrap",
     alignItems:"center",justifyContent:"space-between",gap:12,
     padding:12,border:"1px solid #353740",borderRadius:8}}>
    <label style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 180px"}}>
     <input type="checkbox" disabled={pending}
      checked={selectedSet.has(p.id)}
      onChange={e=>setSelected(cur=>e.target.checked?[...cur,p.id]:
       cur.filter(id=>id!==p.id))}/>
     <span><strong>{p.name}</strong><small style={{display:"block"}}>{p.sku}</small></span>
    </label>
    <label style={{display:"inline-flex",alignItems:"center",gap:8}}>
     <input type="checkbox" disabled={pending} checked={p.collectSalesTax}
      onChange={e=>void apply([p.id],e.target.checked)}/>
     Collect sales tax
    </label>
   </div>)}
  </div>
  {message&&<p role="status">{message}</p>}
  <p className="notice">Saving these flags does not change publication status,
   stock, shipping availability, the checkout gate, or payment processing.</p>
 </section>;
}
