"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {BulkCardMedia} from "./bulk-card-media";
import {BulkInlineOffer} from "./bulk-inline-offer";
import type {BulkSavedMedia,BulkSavedImage} from "./bulk-card-media";
import {useMemo,useState,useTransition} from "react";
import {saveBulkProductDrafts,saveBulkPublicationRequests} from "./bulk-actions";
import {eligiblePrivatePublishIds} from "@/lib/catalog/bulk-publish-selection.mjs";
import {CsvProductImport} from "./csv-product-import";
import {prioritizeImportedProducts} from "@/lib/catalog/prioritize-imported-products.mjs";
import {reconcileSavedBulkRow} from "@/lib/catalog/bulk-save-revision.mjs";

export type BulkEditRow={
 key:string;id?:string;name:string;sku:string;description:string;
 price:string;comparePrice:string;sourceCost:string;categoryId:string;isActive:boolean;
 linkedSource?:boolean;needsSave?:boolean;
};
type Category={id:string;name:string};
type ListingReadiness={
 productId:string;canRequest:boolean;requested:boolean;status:string;missing:string[];
};
type PublishOutcome={id:string;ok:boolean;message:string};

function newRow():BulkEditRow{
 return {key:crypto.randomUUID(),name:"",sku:"",description:"",
  price:"",comparePrice:"",sourceCost:"",categoryId:"",isActive:false,needsSave:true};
}
export function BulkDraftEditor({storeId,editable,initialRows,categories,media,existingImages,listing}:{
 storeId:string;editable:boolean;initialRows:BulkEditRow[];categories:Category[];
 media:BulkSavedMedia[];existingImages:BulkSavedImage[];listing:ListingReadiness[];
}){
 const [rows,setRows]=useState<BulkEditRow[]>(initialRows);
 const [showOfferTiles,setShowOfferTiles]=useState(true);
 const router=useRouter();
 const savedMedia=new Map(media.map(m=>[m.productId,m]));
 const [selected,setSelected]=useState<string[]>([]);
 const [recentImportKeys,setRecentImportKeys]=useState<string[]>([]);
 const [lastSave,setLastSave]=useState<{[key:string]:{ok:boolean;message:string}}>({});
 const [result,setResult]=useState({ok:false,message:"",results:[] as {key:string;ok:boolean;name:string;message:string;id?:string;sku?:string}[]});
 const [pending,startTransition]=useTransition();
 const [publishPending,startPublishTransition]=useTransition();
 const [publishResults,setPublishResults]=useState<PublishOutcome[]>([]);
 const [publicationMessage,setPublicationMessage]=useState("");
 const busy=pending||publishPending;
 const selectedSet=useMemo(()=>new Set(selected),[selected]);
 const selectedRows=rows.filter(r=>selectedSet.has(r.key));
 const savedSelected=selectedRows.filter(r=>Boolean(r.id)&&!r.needsSave);
 const selectedIds=savedSelected.map(r=>r.id!);
 const previewSelected=selectedIds.length&&selectedIds.length<=50
  ?"/supplier/catalog/bulk/preview?ids="+encodeURIComponent(selectedIds.join(","))
  :null;

 function saveSelected(_form:FormData){
  if(!editable||busy)return;
  // Server enforces a 20-row maximum per call. The UI safely submits a larger
  // CSV selection in bounded sequential chunks and reports every row.
  const pendingRows=selectedRows.slice();
  const submittedByKey=new Map(pendingRows.map(r=>[r.key,r]));
  startTransition(async()=>{
   const all: {key:string;ok:boolean;name:string;message:string;id?:string;sku?:string}[]=[];
   let stopped=false;
   for(let i=0;i<pendingRows.length;i+=20){
    const batchForm=new FormData();
    batchForm.set("storeId",storeId);
    batchForm.set("rows",JSON.stringify(pendingRows.slice(i,i+20)));
    try{
     const next=await saveBulkProductDrafts({ok:false,message:"",results:[]},batchForm);
     if(!next.results.length){stopped=true;break;}
     all.push(...next.results);
    }catch{stopped=true;break;}
   }
   const completed=all.filter(r=>r.ok).length;
   setResult({ok:!stopped&&all.length===pendingRows.length&&completed===all.length,
    message:String(completed)+" of "+String(pendingRows.length)+" rows saved."+
     (stopped?" A batch stopped before completion; review and retry remaining rows.":""),
    results:all});
   setLastSave(prev=>({...prev,...Object.fromEntries(all.map(r=>[
    r.key,{ok:r.ok,message:r.message}
   ]))}));
   const savedByKey=new Map(all.filter(o=>o.ok&&o.id).map(o=>[o.key,o]));
   setRows(prev=>prev.map(r=>reconcileSavedBulkRow(r,
    submittedByKey.get(r.key),savedByKey.get(r.key))));
   if(completed>0)router.refresh();
  });
 }

 function change(key:string,field:keyof BulkEditRow,value:string|boolean){
  if(!editable||busy)return;
  setRows(prev=>prev.map(r=>r.key===key?{...r,[field]:value,needsSave:true}:r));
  setLastSave(prev=>{const copy={...prev};delete copy[key];return copy;});
 }
 function toggle(key:string){
  if(busy)return;
  setSelected(prev=>prev.includes(key)?prev.filter(x=>x!==key):[...prev,key]);
 }
 function addRows(count:number){
  if(!editable||busy||rows.length+count>250)return;
  const added=Array.from({length:count},()=>newRow());
  setRows(prev=>[...prev,...added]);
  setSelected(prev=>[...prev,...added.map(r=>r.key)]);
 }
 function loadFromCsv(imported:BulkEditRow[]){
  if(busy)return;
  const incoming=new Set(imported.map(r=>r.key));
  // Put new or updated CSV cards FIRST, so an upload does not disappear
  // beneath up to 100 existing products on narrow/mobile screens.
  setRows(prev=>prioritizeImportedProducts(prev,imported));
  setRecentImportKeys(imported.map(r=>r.key));
  setSelected(imported.map(r=>r.key));
  setLastSave(prev=>{const copy={...prev};for(const key of incoming)delete copy[key];return copy;});
 }
 function removeUnsaved(key:string){
  if(busy)return;
  setRows(prev=>prev.filter(r=>r.key!==key));setSelected(prev=>prev.filter(k=>k!==key));
 }
 const selectedValid=selectedRows.length>0&&selectedRows.length<=250;
 const allSelected=rows.length>0&&selected.length===rows.length;
 const listingByProduct=new Map(listing.map(item=>[item.productId,item]));
 const publicationById=new Map(publishResults.map(item=>[item.id,item]));
 const newlyRequested=new Set(publishResults.filter(item=>item.ok).map(item=>item.id));
 const eligiblePublishIds=eligiblePrivatePublishIds(rows,listing,newlyRequested);
 const eligiblePublishSet=new Set(eligiblePublishIds);
 const eligibleSelectedIds=selectedRows.filter(r=>r.id&&eligiblePublishSet.has(r.id)).map(r=>r.id!);
 const publicationLimit=50;
 function publish(ids:string[]){
  if(!editable||pending||publishPending||ids.length<1||ids.length>publicationLimit||
   new Set(ids).size!==ids.length||ids.some(id=>!eligiblePublishSet.has(id)))return;
  startPublishTransition(async()=>{
   const form=new FormData();
   form.set("storeId",storeId);
   form.set("ids",ids.join(","));
   try{
    const response=await saveBulkPublicationRequests({ok:false,message:"",results:[]},form);
    setPublishResults(previous=>[
     ...previous.filter(item=>!ids.includes(item.id)),
     ...response.results,
    ]);
    setPublicationMessage(response.message);
    if(response.results.some(item=>item.ok))router.refresh();
   }catch{
    setPublicationMessage("Publication requests could not be saved. Refresh and check product status.");
   }
  });
 }
 const recentImported=new Set(recentImportKeys);

 return <section className="apex-bulk-workspace" aria-label="Bulk product creation and editing">
  <CsvProductImport rows={rows} categories={categories} disabled={!editable||busy} onLoad={loadFromCsv}/>
  <div className="apex-bulk-toolbar">
   <button type="button" className="button secondary" onClick={()=>addRows(1)}
    disabled={!editable||busy||rows.length>=250}>+ Add product</button>
   <button type="button" className="button secondary" onClick={()=>addRows(5)}
    disabled={!editable||busy||rows.length>245}>+ Add 5 products</button>
   <button type="button" className="button secondary" onClick={()=>
    setSelected(allSelected?[]:rows.map(r=>r.key))} disabled={busy}>
    {allSelected?"Clear selection":"Select all"}
   </button>
   <button type="button" className="button secondary"
    aria-pressed={showOfferTiles}
    onClick={()=>setShowOfferTiles(value=>!value)}>
    {showOfferTiles?"Hide live offer tiles":"Show live offer tiles"}
   </button>
  </div>
  <p className="notice">Upload a CSV or edit existing products and see the offer tile change immediately. Save selected to keep changes, unlock image/stock controls and proceed to a single or group publication preview. These tiles are private simulations, never live listings.</p>
  {recentImportKeys.length>0&&<p className="apex-bulk-import-notice" role="status">
   {recentImportKeys.length} CSV product {recentImportKeys.length===1?"card is":"cards are"} at the top of the workspace.
   Review their live previews and choose Save selected when ready.
  </p>}
  <div className="apex-bulk-rows" id="bulk-product-cards">
   {rows.map((r,i)=>{
    const status=lastSave[r.key];
    const cardMedia=r.id?savedMedia.get(r.id):undefined;
    const availableStock=cardMedia?.quantityOnHand==null||cardMedia.quantityReserved==null
     ?undefined:Math.max(0,cardMedia.quantityOnHand-cardMedia.quantityReserved);
    const category=categories.find(c=>c.id===r.categoryId)?.name??"Uncategorized";
    const listingStatus=r.id?listingByProduct.get(r.id):undefined;
    const publication=r.id?publicationById.get(r.id):undefined;
    const requested=Boolean(listingStatus?.requested||publication?.ok);
    const publishReady=Boolean(r.id&&!r.needsSave&&eligiblePublishSet.has(r.id));
    return <article key={r.key} className="apex-bulk-row">
     <div className="apex-bulk-row-title">
      <label className="apex-bulk-select">
       <input type="checkbox" disabled={busy} checked={selectedSet.has(r.key)}
        onChange={()=>toggle(r.key)} aria-label={"Select "+(r.name||"new product "+(i+1))}/>
       <strong>{r.name||"New product "+(i+1)}</strong>
       {recentImported.has(r.key)&&<span className="apex-bulk-import-tag">FROM CSV</span>}
      </label>
      <span>{r.needsSave?(r.id?"Unsaved edits":"Imported draft · not saved"):r.id?"Saved product":"Not saved"}</span>
     </div>
     <div className={"apex-bulk-card-layout"+(showOfferTiles?"":" apex-bulk-card-layout-single")}>
      <div className="apex-bulk-editor-side">
     <div className="apex-bulk-fields">
      <label>Name<input value={r.name} maxLength={120}
       disabled={!editable||busy} onChange={e=>change(r.key,"name",e.target.value)}/></label>
      <label>SKU <small>(optional for new)</small><input value={r.sku}
       maxLength={60} disabled={!editable||busy}
       onChange={e=>change(r.key,"sku",e.target.value)}/></label>
      <label>Price (USD)<input type="number" min="0" max="9999999.99"
       step=".01" value={r.price} disabled={!editable||busy}
       onChange={e=>change(r.key,"price",e.target.value)}/></label>
      <label>Source cost (private)<input type="number" min="0" max="9999999.99" step=".01"
       value={r.sourceCost} disabled={!editable||busy||r.linkedSource}
       onChange={e=>change(r.key,"sourceCost",e.target.value)}/></label>
      <label>Compare-at <small>(optional)</small><input type="number"
       min="0" max="9999999.99" step=".01" value={r.comparePrice}
       disabled={!editable||busy} onChange={e=>change(r.key,"comparePrice",e.target.value)}/></label>
      <label>Category<select value={r.categoryId} disabled={!editable||busy}
       onChange={e=>change(r.key,"categoryId",e.target.value)}>
       <option value="">Uncategorized</option>
       {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label className="apex-bulk-active">
       <input type="checkbox" checked={r.isActive}
        disabled={!editable||busy} onChange={e=>change(r.key,"isActive",e.target.checked)}/>
       Active in private catalog
      </label>
      <label className="apex-bulk-description">Description
       <textarea value={r.description} rows={2} maxLength={1500} disabled={!editable||busy}
        onChange={e=>change(r.key,"description",e.target.value)}/></label>
     </div>
     <div className="apex-bulk-row-footer">
      {status?<p role="status" className={status.ok?"apex-bulk-saved":"apex-bulk-error"}>
       {status.ok?"✓ Saved":"Not saved"} — {status.message}</p>
       :<p className="notice">Select to include in your next save.</p>}
      <div className="actions">
       {r.id&&!r.needsSave&&<Link className="button secondary" href={"/supplier/catalog/preview/"+r.id}>
        Preview single
       </Link>}
       {!r.id&&<button type="button" className="button secondary"
        disabled={busy} onClick={()=>removeUnsaved(r.key)}>Remove unsaved</button>}
      </div>
     </div>
     {r.id&&!r.needsSave
      ?<BulkCardMedia key={r.id+":"+String(savedMedia.get(r.id)?.quantityOnHand??"missing")} storeId={storeId} productId={r.id}
         enabled={editable&&!busy}
         imageUrl={savedMedia.get(r.id)?.imageUrl}
         quantityOnHand={savedMedia.get(r.id)?.quantityOnHand}
         quantityReserved={savedMedia.get(r.id)?.quantityReserved}
         existingImages={existingImages}/>
      :<p className="apex-bulk-media-locked">
         {r.id?"Save product edits to unlock image and stock tools.":"Save this draft to upload or reuse an image and set stock."}
        </p>}
      </div>
      {showOfferTiles&&<BulkInlineOffer row={r} category={category}
        imageUrl={cardMedia?.imageUrl} availableStock={availableStock}
        canPublish={publishReady} requested={requested}
        publishing={publishPending} onPublish={()=>r.id&&publish([r.id])}
        publicationMessage={publication?.message}
        publicationNote={r.id&&!r.needsSave&&!requested&&!publishReady
          ?listingStatus?.missing.length
            ?"Complete to request: "+listingStatus.missing.join(", ")
            :listingStatus?.status??"Private publication request unavailable"
          :undefined}/>}
     </div>
    </article>;
   })}
  </div>
  <div className="apex-bulk-footer">
   <form action={saveSelected}>
    <button type="submit" className="button primary" disabled={!editable||busy||!selectedValid}>
     {pending?"Saving…":"Save selected ("+selectedRows.length+")"}
    </button>
   </form>
   {previewSelected?<Link className="button secondary" href={previewSelected}>
     Preview selected ({selectedIds.length})
    </Link>:<span className="notice">Select saved products to preview together.</span>}
   <Link className="button secondary" href="/supplier/catalog/bulk/preview?all=1">
    Preview all saved
   </Link>
   <button type="button" className="button secondary"
    disabled={!editable||pending||publishPending||!eligibleSelectedIds.length||eligibleSelectedIds.length>publicationLimit}
    onClick={()=>publish(eligibleSelectedIds)}>
    {publishPending?"Saving publication requests…":"Publish selected ("+eligibleSelectedIds.length+")"}
   </button>
   <button type="button" className="button primary"
    disabled={!editable||pending||publishPending||!eligiblePublishIds.length||eligiblePublishIds.length>publicationLimit}
    onClick={()=>publish(eligiblePublishIds)}>
    {publishPending?"Saving publication requests…":"Publish all eligible ("+eligiblePublishIds.length+")"}
   </button>
  </div>
  <p className="notice">Publish submits private supplier requests only after saved product details and stock pass checks. Administrative holds remain enforced; no offer becomes publicly visible.</p>
  {eligiblePublishIds.length>publicationLimit&&<p role="status" className="notice">
   More than 50 eligible products loaded. Publish selected groups of up to 50.
  </p>}
  {publicationMessage&&<p role="status" className="apex-bulk-result">{publicationMessage}</p>}
  {selectedRows.length>20&&<p className="notice">The selected products will be saved in sequential batches of 20.</p>}
  {result.message&&<p role="status" className="apex-bulk-result">{result.message}</p>}
 </section>;
}
