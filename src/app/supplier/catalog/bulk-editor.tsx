"use client";

import Link from "next/link";
import Image from "next/image";
import {previewUsdCents} from "@/lib/catalog/offer-preview-money.mjs";
import {useRouter} from "next/navigation";
import {BulkCardMedia} from "./bulk-card-media";
import {SupplierReviewSubmission} from "./review-submission";
import {BulkInlineOffer} from "./bulk-inline-offer";
import type {BulkSavedMedia,BulkSavedImage} from "./bulk-card-media";
import {useEffect,useMemo,useRef,useState,useTransition} from "react";
import {saveBulkProductDrafts,saveBulkPublicationRequests,saveBulkListingIntents,resubmitSupplierCorrections} from "./bulk-actions";
import {eligiblePrivatePublishIds} from "@/lib/catalog/bulk-publish-selection.mjs";
import {CsvProductImport} from "./csv-product-import";
import {prioritizeImportedProducts} from "@/lib/catalog/prioritize-imported-products.mjs";
import {reconcileSavedBulkRow} from "@/lib/catalog/bulk-save-revision.mjs";
import {filterSupplierBulkRows,supplierBulkWorkspaceSummary} from "@/lib/catalog/bulk-workspace-filter.mjs";
import {privateBulkReadiness} from "@/lib/catalog/private-bulk-readiness.mjs";
import {supplierAdminFeedback} from "@/lib/catalog/supplier-admin-feedback.mjs";
import {bulkSetupHref} from "@/lib/catalog/bulk-setup-targets.mjs";
import {bulkViewAfterEdit,selectEditedBulkRow} from "@/lib/catalog/bulk-edit-visibility.mjs";
import {stageSelectedBulkSetup} from "@/lib/catalog/bulk-setup-batch.mjs";
import {assessReviewedTaxonomy,stageReviewedTaxonomy} from "@/lib/catalog/reviewed-taxonomy-staging.mjs";
import {bulkRowsRequiringSave,reconcileBulkSaveBatch,bulkSaveProgress,bulkUnfinishedSaveKeys} from "@/lib/catalog/bulk-save-retry.mjs";
import {mergeBulkSaveRetryKeys} from "@/lib/catalog/bulk-inline-save-retry.mjs";

export type BulkEditRow={
 key:string;id?:string;name:string;sku:string;description:string;
 price:string;comparePrice:string;sourceCost:string;categoryId:string;isActive:boolean;tagsText?:string;
 linkedSource?:boolean;needsSave?:boolean;
};
type Category={id:string;name:string};
type ReviewedCategoryProposal={id:string;sku:string;name:string;category:string|null;status:string;note:string};
type ListingReadiness={
 productId:string;canRequest:boolean;requested:boolean;status:string;kind:string;reason?:string|null;missing:string[];correctionsPending?:boolean;
 visibilityKind:string;visibilityLabel:string;visibilityDescription:string;
 stockKind:string;stockLabel:string;
 imageStatusKind:string;imageStatusLabel:string;imageStatusMessage:string;imageNeedsAction:boolean;hasImage:boolean;
 reviewStatusAvailable:boolean;reviewStatus:string;canSubmitReview:boolean;
};
type PublishOutcome={id:string;ok:boolean;message:string};

function newRow():BulkEditRow{
 return {key:crypto.randomUUID(),name:"",sku:"",description:"",
  price:"",comparePrice:"",sourceCost:"",categoryId:"",isActive:false,tagsText:"",
  needsSave:true};
}
export function BulkDraftEditor({storeId,editable,initialRows,categories,media,existingImages,listing,resubmissionEnabled=false,taxonomyProposal,taxonomyStoreId,initialEditProductId,initialNewProduct=false}:{
 storeId:string;editable:boolean;initialRows:BulkEditRow[];categories:Category[];
 media:BulkSavedMedia[];existingImages:BulkSavedImage[];listing:ListingReadiness[];resubmissionEnabled?:boolean;
 taxonomyProposal?:ReadonlyArray<ReviewedCategoryProposal>;taxonomyStoreId?:string;
 initialEditProductId?:string;initialNewProduct?:boolean;
}){
 const [rows,setRows]=useState<BulkEditRow[]>(()=>initialNewProduct&&editable
  ?[...initialRows,{key:"quick-add-new-product",name:"",sku:"",description:"",
    price:"",comparePrice:"",sourceCost:"",categoryId:"",isActive:true,needsSave:true}]
  :initialRows);
 const [showOfferTiles,setShowOfferTiles]=useState(false);
 const [productSearch,setProductSearch]=useState("");
 const [viewFilter,setViewFilter]=useState(initialNewProduct&&editable?"unsaved":"all");
 const [setupCategoryId,setSetupCategoryId]=useState("");
 const [setupMessage,setSetupMessage]=useState("");
 const [taxonomyMessage,setTaxonomyMessage]=useState("");
 const [saveRetryKeys,setSaveRetryKeys]=useState<string[]>([]);
 const router=useRouter();
 const savedMedia=new Map(media.map(m=>[m.productId,m]));
 const [selected,setSelected]=useState<string[]>(initialNewProduct&&editable?["quick-add-new-product"]:[]);
 const [recentImportKeys,setRecentImportKeys]=useState<string[]>([]);
 const [lastSave,setLastSave]=useState<{[key:string]:{ok:boolean;message:string}}>({});
 const [result,setResult]=useState({ok:false,message:"",results:[] as {key:string;ok:boolean;name:string;message:string;id?:string;sku?:string}[]});
 const [pending,startTransition]=useTransition();
 const [publishPending,startPublishTransition]=useTransition();
 const [publishResults,setPublishResults]=useState<PublishOutcome[]>([]);
 const [listingOverrides,setListingOverrides]=useState<Record<string,boolean>>({});
 const [editOpenKeys,setEditOpenKeys]=useState<string[]>(
  initialEditProductId&&initialRows.some(p=>p.id===initialEditProductId)
   ?[initialEditProductId]:[]);
 const previousEditTarget=useRef(initialEditProductId);
 useEffect(()=>{
  if(initialEditProductId&&initialEditProductId!==previousEditTarget.current)
   setEditOpenKeys(prev=>prev.includes(initialEditProductId)?prev:[...prev,initialEditProductId]);
  previousEditTarget.current=initialEditProductId;
 },[initialEditProductId]);
 const [publicationMessage,setPublicationMessage]=useState("");
 const [correctionNotes,setCorrectionNotes]=useState<Record<string,string>>({});
 const [correctionResults,setCorrectionResults]=useState<Record<string,{ok:boolean;message:string}>>({});
 const [correctionConfirmed,setCorrectionConfirmed]=useState<string[]>([]);
 const [correcting,startCorrectionTransition]=useTransition();
 const busy=pending||publishPending||correcting;
 const selectedSet=useMemo(()=>new Set(selected),[selected]);
 const effectiveListing=listing.map(item=>({...item,requested:listingOverrides[item.productId]??item.requested}));
 const newlyRequested=new Set(Object.entries(listingOverrides).filter(([,value])=>value).map(([id])=>id));
 const overview=supplierBulkWorkspaceSummary(rows,effectiveListing);
 // Server-scoped taxonomy notes remain private to this authenticated editor.
 // Immutable IDs keep corrected titles and SKUs visible for review.
 const heldTaxonomy=useMemo(()=>new Map((taxonomyProposal??[])
  .filter(item=>item.category===null).map(item=>[item.id,item])),[taxonomyProposal]);
 const heldTaxonomyIds=useMemo(()=>new Set(heldTaxonomy.keys()),[heldTaxonomy]);
 const visibleRows:BulkEditRow[]=filterSupplierBulkRows(rows,productSearch,viewFilter,effectiveListing,newlyRequested,new Set(saveRetryKeys),heldTaxonomyIds);
 const selectedRows=visibleRows.filter(r=>selectedSet.has(r.key));
 const selectedMissingCategory=selectedRows.filter(row=>!row.categoryId).length;
 const selectedInactive=selectedRows.filter(row=>row.isActive===false).length;
 const taxonomyReview=useMemo(()=>taxonomyProposal
  ?assessReviewedTaxonomy(rows,taxonomyProposal,categories,storeId,taxonomyStoreId)
  :null,[rows,taxonomyProposal,categories,storeId,taxonomyStoreId]);
 const pendingSaveRows:BulkEditRow[]=bulkRowsRequiringSave(selectedRows,lastSave);
 const savedSelected=selectedRows.filter(r=>Boolean(r.id)&&!r.needsSave);
 const selectedIds=savedSelected.map(r=>r.id!);
 const previewSelected=selectedIds.length&&selectedIds.length<=50
  ?"/supplier/catalog/bulk/preview?ids="+encodeURIComponent(selectedIds.join(","))
  :null;

 function saveRows(chosenRows:BulkEditRow[],mode:"selected"|"single"){
  if(!editable||busy||!chosenRows.length)return;
  // The single-card button uses the same authenticated 20-row server action
  // as Save selected, but never submits unrelated checked cards.
  const pendingRows=chosenRows.slice();
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
     const batch=reconcileBulkSaveBatch(pendingRows.slice(i,i+20),next.results);
     all.push(...batch.results);
     if(!batch.complete){stopped=true;break;}
    }catch{stopped=true;break;}
   }
   const progress=bulkSaveProgress(pendingRows,all,stopped);
   const unfinished=bulkUnfinishedSaveKeys(pendingRows,all);
   setSaveRetryKeys(previous=>mergeBulkSaveRetryKeys(previous,pendingRows,unfinished));
   // The selected batch view focuses failures. For an individual card,
   // keep the editor in place and show its own success/failure message.
   if(mode==="selected"){
    if(unfinished.length){setProductSearch("");setViewFilter("save_retries");}
    else if(viewFilter==="save_retries")setViewFilter("all");
   }
   setResult({ok:progress.ok,message:progress.message,results:all});
   const returnedKeys=new Set(all.map(item=>item.key));
   const missingResults=Object.fromEntries(pendingRows
    .filter(item=>!returnedKeys.has(item.key))
    .map(item=>[item.key,{ok:false,message:"Save was not confirmed. Retry this card."}]));
   setLastSave(prev=>({...prev,...Object.fromEntries(all.map(r=>[
    r.key,{ok:r.ok,message:r.message}
   ])),...missingResults}));
   const savedByKey=new Map(all.filter(o=>o.ok&&o.id).map(o=>[o.key,o]));
   setRows(prev=>prev.map(r=>reconcileSavedBulkRow(r,
    submittedByKey.get(r.key),savedByKey.get(r.key))));
   if(progress.saved>0)setSetupMessage(progress.ok
    ?"Selected edits saved. Refresh the product cards to confirm their current readiness."
    :"Some edits were saved, but others still need attention. Review the retry results.");
   if(progress.saved>0)router.refresh();
  });
 }
 function saveSelected(_form:FormData){
  if(pendingSaveRows.length)saveRows(pendingSaveRows,"selected");
 }
 function saveSingle(row:BulkEditRow){
  if(row.needsSave===true||!row.id)saveRows([row],"single");
 }

 function change(key:string,field:keyof BulkEditRow,value:string|boolean){
  if(!editable||busy)return;
  // A status-filtered saved card can vanish on the first keystroke when it
  // becomes unsaved. Keep the edited card visible so the supplier can finish.
  // Name/SKU edits also clear an active text search that may stop matching.
  const nextView=bulkViewAfterEdit(productSearch,field);
  if(nextView.filter!==viewFilter)setViewFilter(nextView.filter);
  if(nextView.query!==productSearch)setProductSearch(nextView.query);
  setRows(prev=>prev.map(r=>r.key===key?{...r,[field]:value,needsSave:true}:r));
  // The edited row is automatically included in Save selected. Existing
  // multi-row selection is retained, never silently overwritten.
  setSelected(prev=>selectEditedBulkRow(prev,key));
  setLastSave(prev=>{const copy={...prev};delete copy[key];return copy;});
 }
 function toggle(key:string){
  if(busy)return;
  setSelected(prev=>prev.includes(key)?prev.filter(x=>x!==key):[...prev,key]);
 }
 function stageSetup(kind:"fill-missing-category"|"mark-active"){
  if(!editable||busy||selectedRows.length===0)return;
  const change=kind==="fill-missing-category"
   ?{kind,categoryId:setupCategoryId}:{kind};
  const staged=stageSelectedBulkSetup(rows,selectedRows.map(row=>row.key),
    change,categories.map(category=>category.id));
  if(!staged.ok){
   setSetupMessage(staged.reason??"Unable to stage changes.");
   return;
  }
  if(staged.changedKeys.length===0){
   setSetupMessage("The selected products already have this setting. Nothing changed.");
   return;
  }
  setRows(staged.rows as BulkEditRow[]);
  // Keep only the changed cards selected when switching to All products.
  // Hidden checked items must not be pulled into an unrelated save.
  setSelected(staged.changedKeys);
  setProductSearch("");
  setViewFilter("all");
  setLastSave(previous=>{
   const copy={...previous};
   for(const key of staged.changedKeys)delete copy[key];
   return copy;
  });
  setSetupMessage(staged.changedKeys.length+" product"+
   (staged.changedKeys.length===1?"":"s")+
   " staged locally. Review the selected cards, then Save selected.");
 }
 function stageSuggestedCategories(){
  if(!editable||busy||!taxonomyReview?.ready)return;
  const staged=stageReviewedTaxonomy(rows,taxonomyReview);
  if(!staged.ok){
   setTaxonomyMessage(staged.reason??"Catalog product details changed. Refresh and review.");
   return;
  }
  setRows(staged.rows as BulkEditRow[]);
  setSelected(staged.changedKeys);
  setProductSearch("");
  setViewFilter("all");
  setLastSave(previous=>{
   const next={...previous};
   for(const key of staged.changedKeys)delete next[key];
   return next;
  });
  setTaxonomyMessage(staged.changedKeys.length+
   " proposed category assignments staged. Review the selected cards, then Save selected. No products are activated or published.");
 }
 function addRows(count:number){
  if(!editable||busy||rows.length+count>250)return;
  setProductSearch("");setViewFilter("all");
  const added=Array.from({length:count},()=>newRow());
  setRows(prev=>[...prev,...added]);
  setSelected(prev=>[...prev,...added.map(r=>r.key)]);
 }
 function loadFromCsv(imported:BulkEditRow[]){
  if(busy)return;
  setProductSearch("");setViewFilter("all");setSaveRetryKeys([]);
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
 const selectedValid=pendingSaveRows.length>0&&pendingSaveRows.length<=250;
 const allVisibleSelected=visibleRows.length>0&&visibleRows.every(r=>selectedSet.has(r.key));
 const listingByProduct=new Map(effectiveListing.map(item=>[item.productId,item]));
 const publicationById=new Map(publishResults.map(item=>[item.id,item]));
 const eligiblePublishIds=eligiblePrivatePublishIds(rows,effectiveListing,newlyRequested);
 const eligiblePublishSet=new Set(eligiblePublishIds);
 const eligibleSelectedIds=selectedRows.filter(r=>r.id&&eligiblePublishSet.has(r.id)).map(r=>r.id!);
 const eligibleUnpublishIds=selectedRows.filter(r=>r.id&&listingByProduct.get(r.id)?.requested).map(r=>r.id!);
 const publicationLimit=50;
 function toggleEdit(key:string){if(busy)return;setEditOpenKeys(previous=>previous.includes(key)?previous.filter(id=>id!==key):[...previous,key]);}
 function publish(ids:string[],action:"publish"|"unpublish"="publish"){
  if(!editable||busy||ids.length<1||ids.length>publicationLimit||
   new Set(ids).size!==ids.length||ids.some(id=>action==="publish"
     ?!eligiblePublishSet.has(id):!listingByProduct.get(id)?.requested))return;
  startPublishTransition(async()=>{
   const form=new FormData();
   form.set("storeId",storeId);
   form.set("ids",ids.join(","));
    form.set("action",action);
   try{
    const response=action==="publish"
      ?await saveBulkPublicationRequests({ok:false,message:"",results:[]},form)
      :await saveBulkListingIntents({ok:false,message:"",results:[]},form);
    setPublishResults(previous=>[
     ...previous.filter(item=>!ids.includes(item.id)),
     ...response.results,
    ]);
    setPublicationMessage(response.message);
    setListingOverrides(previous=>({...previous,...Object.fromEntries(response.results.filter(item=>item.ok).map(item=>[item.id,action==="publish"]))}));
    if(response.results.some(item=>item.ok))router.refresh();
   }catch{
    setPublicationMessage("Publishing settings could not be saved. Refresh and check product status.");
   }
  });
 }
 function resubmitCorrections(productId:string,key:string){
  const note=correctionNotes[productId]?.trim()??"";
  const item=rows.find(row=>row.key===key);
  const status=listingByProduct.get(productId);
  if(!editable||!resubmissionEnabled||busy||!item?.id||item.needsSave||
   !["hold","review"].includes(status?.kind??"")||note.length<5||note.length>500)return;
  startCorrectionTransition(async()=>{
   const form=new FormData();
   form.set("storeId",storeId);
   form.set("productId",productId);
   form.set("note",note);
   try{
    const outcome=await resubmitSupplierCorrections({ok:false,message:""},form);
    setCorrectionResults(prev=>({...prev,[productId]:outcome}));
    if(outcome.ok){
     setCorrectionConfirmed(prev=>[...new Set([...prev,productId])]);
     router.refresh();
    }
   }catch{
    setCorrectionResults(prev=>({...prev,[productId]:{ok:false,
     message:"Review request failed. Keep your saved changes and retry."}}));
   }
  });
 }
 const recentImported=new Set(recentImportKeys);

 return <section className="apex-bulk-workspace" aria-label="Bulk product creation and editing">
  <a href="#apex-bulk-actions" className="button secondary apex-bulk-jump-actions">Jump to Save / Publish actions</a>
  <details className="apex-bulk-advanced" id="apex-csv-tools">
   <summary>CSV import and export <span>Download templates or upload multiple product changes</span></summary>
   <CsvProductImport rows={rows} categories={categories} disabled={!editable||busy} onLoad={loadFromCsv}/>
  </details>
  <h2 className="apex-bulk-products-heading" id="apex-product-workspace">Saved products</h2>
  <p className="apex-bulk-workspace-summary" role="status">
   <strong>{overview.privateSaved} saved private cards</strong>
   <span>· {overview.imagesAttached} images attached</span>
   <span>· {overview.publishRequested} publish settings on</span>
   {overview.adminHolds>0&&<span>· {overview.adminHolds} admin holds</span>}
  </p>
  <div className="apex-bulk-filterbar" aria-label="Find and filter private products">
   <label htmlFor="apex-bulk-search">Find product
    <input id="apex-bulk-search" type="search" value={productSearch}
     placeholder="Search title or SKU" autoComplete="off"
     onChange={e=>{setProductSearch(e.target.value);setSelected([]);}}/>
   </label>
   <label htmlFor="apex-bulk-status-filter">Show
    <select id="apex-bulk-status-filter" value={viewFilter}
     onChange={e=>{setViewFilter(e.target.value);setSelected([]);}}>
     <option value="all">All products</option>
     <option value="unsaved">Unsaved drafts</option>
     <option value="ready">Ready to publish</option>
     <option value="requested">Publish enabled</option>
     <option value="needs_attention">Needs setup / held ({overview.needsAttention})</option>
     <option value="image_fixes">Image corrections / missing ({overview.imageFixes})</option>
     <option value="admin_holds">Admin holds ({overview.adminHolds})</option>
     <option value="review_pending">Awaiting review ({overview.reviewPending})</option>
     {heldTaxonomyIds.size>0&&<option value="taxonomy_held">Identity review ({heldTaxonomyIds.size})</option>}
     {saveRetryKeys.length>0&&<option value="save_retries">Fix / retry saves ({saveRetryKeys.length})</option>}
    </select>
   </label>
  </div>
  <p className="apex-bulk-filter-summary" role="status">
   Showing {visibleRows.length} of {rows.length} products · {selectedRows.length} selected in this view.
  </p>
  <div className="apex-bulk-toolbar">
   <button type="button" className="button secondary" onClick={()=>addRows(1)}
    disabled={!editable||busy||rows.length>=250}>+ Add product</button>
   <button type="button" className="button secondary" onClick={()=>addRows(5)}
    disabled={!editable||busy||rows.length>245}>+ Add 5 products</button>
   <button type="button" className="button secondary" onClick={()=>
    setSelected(allVisibleSelected?[]:visibleRows.map(r=>r.key))} disabled={busy||!visibleRows.length}>
    {allVisibleSelected?"Clear selection":"Select visible"}
   </button>
   <button type="button" className="button secondary"
    aria-pressed={showOfferTiles}
    onClick={()=>setShowOfferTiles(value=>!value)}>
    {showOfferTiles?"Hide previews":"Show previews"}
   </button>
  </div>
  <details className="apex-bulk-advanced apex-supplier-batch-setup">
   <summary>Advanced batch setup <span>Category assignment and multi-product setup</span></summary>
  {taxonomyReview&&<section className="supplier-panel" aria-label="Reviewed catalog category mapping"
   style={{maxWidth:"none",marginBottom:18,padding:16}}>
   <h3>Organize saved catalog</h3>
   <p className="notice">Use the reviewed 63-product mapping to stage category changes
    for exact matching names, SKUs and IDs. This only updates <strong>blank categories</strong>;
    it does not change active status, prices, inventory, publication settings, or approvals.</p>
   <p className="notice">
    {taxonomyReview.proposals} categorized in the plan ·
    {" "}{taxonomyReview.alreadyAssigned} already matched ·
    {" "}{taxonomyReview.changes.length} ready to assign ·
    {" "}{taxonomyReview.held} flagged for separate review.
   </p>
   {taxonomyReview.missingCategories.length>0&&
    <p className="notice" role="status">
     Admin must create these categories first: {taxonomyReview.missingCategories.join(", ")}.
    </p>}
   {taxonomyReview.error&&<p className="notice" role="status">{taxonomyReview.error}</p>}
   {(taxonomyReview.unmatched.length>0||taxonomyReview.conflicts.length>0)&&
    <p className="notice">Changed or conflicting entries:
     {" "}{[...taxonomyReview.unmatched,...taxonomyReview.conflicts].join(", ")}.
     No automatic assignment is allowed until the mapping is reviewed.</p>}
   <details>
    <summary>Review proposed groups and flagged products</summary>
    <ul className="supplier-stores">
     {taxonomyProposal?.map(item=><li key={item.id} style={{gap:12,flexWrap:"wrap"}}>
      <span><strong>{item.name}</strong>
       <small style={{display:"block"}}>{item.note}</small></span>
      <span>{item.category??"Review required · unchanged"}</span>
     </li>)}
    </ul>
   </details>
   <div className="apex-bulk-toolbar">
    <button type="button" className="button secondary"
     disabled={!editable||busy||!taxonomyReview.ready}
     onClick={stageSuggestedCategories}>
     Stage {taxonomyReview.changes.length} matching categories
    </button>
    {heldTaxonomyIds.size>0&&<button type="button" className="button secondary"
     disabled={busy}
     onClick={()=>{setProductSearch("");setViewFilter("taxonomy_held");setSelected([]);}}>
     Review {heldTaxonomyIds.size} flagged products
    </button>}
   </div>
   <p className="notice">Nothing is saved automatically. Existing unsaved edits on
    the staged cards will also be included when you press Save selected.</p>
   {taxonomyMessage&&<p role="status" className="apex-bulk-result">{taxonomyMessage}</p>}
  </section>}
  <section className="supplier-panel" aria-label="Bulk product setup"
   style={{maxWidth:"none",marginBottom:18,padding:16}}>
   <h3>Finish selected product setup</h3>
   <p className="notice">Choose cards first, then apply a change. Changes remain
    on this page until you select <strong>Save selected</strong>. Existing categories,
    descriptions, costs, prices, images, stock and approval records are preserved.</p>
   <div className="apex-bulk-toolbar">
    <label htmlFor="apex-bulk-setup-category">Category for uncategorized products
     <select id="apex-bulk-setup-category" value={setupCategoryId}
      disabled={!editable||busy||categories.length===0}
      onChange={e=>setSetupCategoryId(e.target.value)}>
      <option value="">Choose category</option>
      {categories.map(category=><option key={category.id} value={category.id}>
       {category.name}</option>)}
     </select>
    </label>
    <button type="button" className="button secondary"
     disabled={!editable||busy||selectedMissingCategory===0||!setupCategoryId}
     onClick={()=>stageSetup("fill-missing-category")}>
     Fill missing category ({selectedMissingCategory})
    </button>
    <button type="button" className="button secondary"
     disabled={!editable||busy||selectedInactive===0}
     onClick={()=>stageSetup("mark-active")}>
     Mark selected active ({selectedInactive})
    </button>
   </div>
   <p className="notice">Active controls the saved product record, not whether
    customers can see or purchase it. Publish, admin holds and verified release
    eligibility remain separate.</p>
   <form action={saveSelected}>
    <button type="submit" className="button primary"
     disabled={!editable||busy||!selectedValid}>
     {pending?"Saving…":"Save selected changes ("+pendingSaveRows.length+")"}
    </button>
   </form>
   {setupMessage&&<p role="status" className="apex-bulk-result">{setupMessage}</p>}
  </section>
  </details>
  <p className="notice">Tap the pencil to edit the name, description, price, image or stock. Save changes, then set your Publish preference. Admin holds remain visible and cannot be bypassed.</p>
  {recentImportKeys.length>0&&<p className="apex-bulk-import-notice" role="status">
   {recentImportKeys.length} CSV product {recentImportKeys.length===1?"card is":"cards are"} at the top of the workspace.
   Review their live previews and choose Save selected when ready.
  </p>}
  <div className="apex-bulk-rows" id="bulk-product-cards">
   {visibleRows.length===0&&<p className="notice apex-bulk-no-results" role="status">
    No products match this view. Clear search or choose All products to see the other cards.
   </p>}
   {visibleRows.map((r,i)=>{
    const status=lastSave[r.key];
    const cardMedia=r.id?savedMedia.get(r.id):undefined;
    const priceCents=previewUsdCents(r.price);
    const compactPrice=Number.isSafeInteger(priceCents)&&priceCents>0
     ?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(priceCents/100)
     :"Price needed";
    const availableStock=cardMedia?.quantityOnHand==null||cardMedia.quantityReserved==null
     ?undefined:Math.max(0,cardMedia.quantityOnHand-cardMedia.quantityReserved);
    const category=categories.find(c=>c.id===r.categoryId)?.name??"Uncategorized";
    const taxonomyHold=r.id?heldTaxonomy.get(r.id):undefined;
    const listingStatus=r.id?listingByProduct.get(r.id):undefined;
    const publication=r.id?publicationById.get(r.id):undefined;
    const requested=Boolean(listingStatus?.requested);
    const readiness=privateBulkReadiness(r,listingStatus,requested&&Boolean(publication?.ok));
    const imageKind=!r.id?"missing":listingStatus?.imageStatusKind??"unavailable";
    const imageLabel=!r.id?"Image needed":listingStatus?.imageStatusLabel??"Image status unavailable";
    const imageMessage=!r.id?"Save the product, then add an image from the pencil editor.":
     listingStatus?.imageStatusMessage??"Refresh to check image evidence.";
    const imageNeedsAction=!r.id||listingStatus?.imageNeedsAction===true;
    const adminFeedback=r.id?supplierAdminFeedback(listingStatus):null;
    const correctionsPending=Boolean(listingStatus?.correctionsPending||(r.id&&correctionConfirmed.includes(r.id)));
    const override=r.id?listingOverrides[r.id]:undefined;
    const locallyChanged=override!==undefined&&override!==listingStatus?.requested;
    const visibilityKind=!r.id?"private":locallyChanged
     ?override?"requested":"private":listingStatus?.visibilityKind??"unavailable";
    const visibilityLabel=!r.id?"Draft · not live":locallyChanged
     ?override?"Not visible":"Not visible":listingStatus?.visibilityLabel??"Visibility unavailable";
    const visibilityDescription=!r.id?"Save the product details before turning on Publish.":
     locallyChanged
      ?"The supplier preference changed. A fresh protected release decision is needed before customer visibility can be confirmed.":
      listingStatus?.visibilityDescription??"Refresh to check the protected release decision.";
    const publishReady=Boolean(r.id&&!r.needsSave&&eligiblePublishSet.has(r.id));
    return <article key={r.key} id={r.id?"saved-"+r.id:undefined}
      className={"apex-bulk-row"+((editOpenKeys.includes(r.key)||!r.id)?" apex-bulk-row-editing":"")}>
     <div className="apex-bulk-row-title">
      <div className="apex-supplier-row-thumbnail" aria-hidden="true">
       {cardMedia?.imageUrl?<Image src={cardMedia.imageUrl}
         width={64} height={64} alt="" unoptimized/>:<span>+</span>}
      </div>
      <label className="apex-bulk-select">
       <input type="checkbox" disabled={busy} checked={selectedSet.has(r.key)}
        onChange={()=>toggle(r.key)} aria-label={"Select "+(r.name||"new product "+(i+1))}/>
       <span className="apex-supplier-card-heading">
        <strong title={r.name||"New product "+(i+1)}>{r.name||"New product "+(i+1)}</strong>
        <small>{compactPrice} · {category}</small>
       </span>
      </label>
      <div className="apex-bulk-card-top-actions">
       <button type="button" className="apex-bulk-card-pencil"
        aria-label={"Edit "+(r.name||"new product")+" details"} aria-expanded={editOpenKeys.includes(r.key)||!r.id}
        onClick={()=>toggleEdit(r.key)} disabled={busy} title="Edit product, image and inventory">✎</button>
       <label className="apex-bulk-card-publish-switch">
        <span>{requested?"Publish enabled":"Publish"}</span>
        <input type="checkbox" role="switch" aria-label={"Publish "+(r.name||"new product")}
         checked={requested} disabled={!editable||busy||!r.id||r.needsSave||(!requested&&!publishReady)}
         onChange={e=>r.id&&publish([r.id],e.target.checked?"publish":"unpublish")}/>
       </label>
       </div>
      <div className="apex-bulk-card-status-row">
       <span className={"apex-bulk-visibility-state apex-bulk-visibility-"+visibilityKind}
        title={visibilityDescription} aria-label={"Customer storefront: "+visibilityLabel}>
        Storefront: {visibilityLabel}
       </span>
       {r.id&&<span className={"apex-bulk-inventory-state apex-bulk-inventory-"+(listingStatus?.stockKind??"unverified")}>
        {listingStatus?.stockLabel??"Inventory unavailable"}
       </span>}
       {adminFeedback&&<span className={"apex-bulk-readiness-state apex-bulk-readiness-"+readiness.kind}>Needs attention</span>}
       {recentImported.has(r.key)&&<span className="apex-bulk-import-tag">FROM CSV</span>}
      </div>
     </div>
     {taxonomyHold&&<p className="notice" role="note">
      <strong>Identity review required:</strong> {taxonomyHold.note}
      {" "}Check source documentation before assigning a category or requesting public release.
     </p>}
     <details className="apex-bulk-readiness-details">
      <summary>{adminFeedback
       ?"Administrator feedback"+(readiness.missing.length?" · "+readiness.missing.length+" setup items":"")
       :readiness.missing.length
        ?readiness.missing.length+" setup item"+(readiness.missing.length===1?"":"s")+" remaining"
        :"Status details"}</summary>
      <p><strong>Customer visibility:</strong> {visibilityDescription}</p>
      <p><strong>Setup status:</strong> {readiness.label}</p>
      <span className={"apex-bulk-image-status apex-bulk-image-"+imageKind}
       title={imageMessage} aria-label={"Product image: "+imageLabel}>{imageLabel}</span>
      <p><strong>Image evidence:</strong> {imageMessage}</p>
      {imageNeedsAction&&<button type="button" className="button secondary apex-bulk-media-fix"
       disabled={busy} onClick={()=>setEditOpenKeys(prev=>prev.includes(r.key)?prev:[...prev,r.key])}>
       Edit image and product details
      </button>}
      <p>{readiness.description}</p>
      {r.id&&listingStatus?.reviewStatusAvailable&&<section className="apex-bulk-inline-review">
       <strong>Internal product review: {listingStatus.reviewStatus==="approved_internal"
        ?"Approved internally":listingStatus.reviewStatus==="pending_review"
        ?"Pending admin review":listingStatus.reviewStatus==="changes_requested"
        ?"Changes requested":"Not submitted"}</strong>
       {listingStatus.canSubmitReview
        ?r.needsSave
         ?<p className="notice">Save your product changes first, then submit the updated draft here.</p>
         :<SupplierReviewSubmission storeId={storeId} productId={r.id}
           enabled={editable&&!busy}/>
        :<p className="notice">{listingStatus.reviewStatus==="pending_review"
         ?"The administrator is reviewing this private submission."
         :listingStatus.reviewStatus==="approved_internal"
          ?"Approved for internal content only; separate eligibility and public-image approval are still required."
          :"Finish the remaining setup items before requesting review."}</p>}
      </section>}
      {adminFeedback&&r.id&&<div className="apex-bulk-admin-corrections">
       <button type="button" className="button secondary" disabled={busy}
        onClick={()=>setEditOpenKeys(prev=>prev.includes(r.key)?prev:[...prev,r.key])}>
        Open product editor
       </button>
       {correctionsPending&&<p role="status"><strong>Corrections submitted · awaiting admin review.</strong> This listing is still held.</p>}
       {resubmissionEnabled
        ?<>
         <label>What changed? (required for review)
          <textarea maxLength={500} rows={2} value={correctionNotes[r.id]??""}
           disabled={busy||!editable}
           placeholder="Briefly describe the corrections you saved."
           onChange={e=>setCorrectionNotes(prev=>({...prev,[r.id!]:e.target.value}))}/>
         </label>
         <button type="button" className="button secondary"
          disabled={!editable||busy||r.needsSave||(correctionNotes[r.id]?.trim().length??0)<5}
          onClick={()=>resubmitCorrections(r.id!,r.key)}>
          {correcting?"Submitting…":"Resubmit saved corrections for review"}
         </button>
         {r.needsSave&&<p className="notice">Save your product edits first, then resubmit.</p>}
         {correctionResults[r.id]&&<p role="status">{correctionResults[r.id].message}</p>}
        </>
        :<p className="notice">Save your corrections, then contact the platform administrator for review. In-app resubmission is not enabled yet.</p>}
      </div>}
      {adminFeedback&&<p className="apex-bulk-admin-feedback">
       <strong>{adminFeedback.heading}:</strong> {adminFeedback.message}
      </p>}
      {readiness.missing.length>0&&<ul>
       {readiness.missing.map((item:string)=>{
         const href=bulkSetupHref(item,r.key);
         return <li key={item}>{href
          ?<a href={href} className="apex-bulk-fix-link">{item} <span aria-hidden="true">↳</span></a>
          :item}</li>;
        })}
      </ul>}
     </details>
     <div className={"apex-bulk-card-layout"+(showOfferTiles&&(editOpenKeys.includes(r.key)||!r.id)?"":" apex-bulk-card-layout-single")}>
      {(editOpenKeys.includes(r.key)||!r.id)&&<div className="apex-bulk-editor-side">
     <div className="apex-bulk-fields">
      <label>Name<input id={"bulk-fix-"+r.key+"-name"} value={r.name} maxLength={120}
       disabled={!editable||busy} onChange={e=>change(r.key,"name",e.target.value)}/></label>
      <label>SKU <small>(optional for new)</small><input id={"bulk-fix-"+r.key+"-sku"} value={r.sku}
       maxLength={60} disabled={!editable||busy}
       onChange={e=>change(r.key,"sku",e.target.value)}/></label>
      <label>Price (USD)<input id={"bulk-fix-"+r.key+"-price"} type="number" min="0" max="9999999.99"
       step=".01" value={r.price} disabled={!editable||busy}
       onChange={e=>change(r.key,"price",e.target.value)}/></label>
      <label>Source cost (private)<input type="number" min="0" max="9999999.99" step=".01"
       value={r.sourceCost} disabled={!editable||busy||r.linkedSource}
       onChange={e=>change(r.key,"sourceCost",e.target.value)}/></label>
      <label>Compare-at <small>(optional)</small><input type="number"
       min="0" max="9999999.99" step=".01" value={r.comparePrice}
       disabled={!editable||busy} onChange={e=>change(r.key,"comparePrice",e.target.value)}/></label>
      <label>Category<select id={"bulk-fix-"+r.key+"-category"} value={r.categoryId} disabled={!editable||busy}
       onChange={e=>change(r.key,"categoryId",e.target.value)}>
       <option value="">Uncategorized</option>
       {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label className="apex-bulk-active">
       <input id={"bulk-fix-"+r.key+"-active"} type="checkbox" checked={r.isActive}
        disabled={!editable||busy} onChange={e=>change(r.key,"isActive",e.target.checked)}/>
       Active in private catalog
      </label>
      <label>Search tags <small>(optional; separate with |)</small>
       <input type="text" maxLength={492} value={r.tagsText??""} disabled={!editable||busy}
        onChange={e=>change(r.key,"tagsText",e.target.value)}/></label>
      <label className="apex-bulk-description">Description
       <textarea id={"bulk-fix-"+r.key+"-description"} value={r.description} rows={2} maxLength={1500} disabled={!editable||busy}
        onChange={e=>change(r.key,"description",e.target.value)}/></label>
     </div>
     <div className="apex-bulk-row-footer">
      {status?<p role="status" className={status.ok&&!r.needsSave?"apex-bulk-saved":"apex-bulk-error"}>
       {status.ok?(r.needsSave?"Previous version saved · newer edits unsaved":"✓ Saved"):"Not saved"} — {status.message}</p>
       :<p className="notice">{r.needsSave||!r.id
        ?"Save here or use Save selected below for multiple products."
        :"No unsaved edits."}</p>}
      <div className="actions">
       {(!r.id||r.needsSave===true)&&<button type="button" className="button primary apex-bulk-save-single"
        disabled={!editable||busy} onClick={()=>saveSingle(r)}
        aria-label={"Save changes to "+(r.name||"new product")}>
        {pending?"Saving…":"Save changes"}
       </button>}
       {r.id&&!r.needsSave&&<Link className="button secondary" href={"/supplier/catalog/preview/"+r.id}>
        Preview single
       </Link>}
       {!r.id&&<button type="button" className="button secondary"
        disabled={busy} onClick={()=>removeUnsaved(r.key)}>Remove unsaved</button>}
      </div>
     </div>
     <div id={"bulk-fix-"+r.key+"-media"} className="apex-bulk-media-target" tabIndex={-1} aria-label="Private product image and stock tools">
     {r.id&&!r.needsSave
      ?<BulkCardMedia key={r.id+":"+String(savedMedia.get(r.id)?.quantityOnHand??"missing")+":"+String(savedMedia.get(r.id)?.trackQuantities??true)}
         storeId={storeId} productId={r.id}
         enabled={editable&&!busy}
         imageUrl={savedMedia.get(r.id)?.imageUrl}
         quantityOnHand={savedMedia.get(r.id)?.quantityOnHand}
         quantityReserved={savedMedia.get(r.id)?.quantityReserved}
         trackQuantities={savedMedia.get(r.id)?.trackQuantities??true}
         existingImages={existingImages}/>
      :<p className="apex-bulk-media-locked">
         {r.id?"Save product edits to unlock image and stock tools.":"Save this draft to upload or reuse an image and set stock."}
        </p>}
     </div>
      </div>}
      {showOfferTiles&&<BulkInlineOffer row={r} category={category}
        imageUrl={cardMedia?.imageUrl} availableStock={availableStock}
        canPublish={publishReady} requested={requested}
        publishing={publishPending} onPublish={()=>r.id&&publish([r.id])} showPublishAction={false}
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
  <div className="apex-bulk-footer" id="apex-bulk-actions" aria-label="Bulk product actions">
   <form action={saveSelected}>
    <button type="submit" className="button primary" disabled={!editable||busy||!selectedValid}
     aria-label={pending?"Saving selected products":"Save selected ("+pendingSaveRows.length+" pending changes)"}>
     {pending?"Saving…":<>
      <span className="apex-bulk-action-long">Save selected ({pendingSaveRows.length})</span>
      <span className="apex-bulk-action-short" aria-hidden="true">Save ({pendingSaveRows.length})</span>
     </>}
    </button>
   </form>
   {previewSelected&&<Link className="button secondary" href={previewSelected}
    aria-label={"Preview selected ("+selectedIds.length+")"}>
     <span className="apex-bulk-action-long">Preview selected ({selectedIds.length})</span>
     <span className="apex-bulk-action-short" aria-hidden="true">Preview selected</span>
    </Link>}
   <Link className="button secondary" href="/supplier/catalog/bulk/preview?all=1"
    aria-label="Preview all saved">
    <span className="apex-bulk-action-long">Preview all saved</span>
    <span className="apex-bulk-action-short" aria-hidden="true">Preview all</span>
   </Link>
   <button type="button" className="button secondary"
    disabled={!editable||pending||publishPending||!eligibleSelectedIds.length||eligibleSelectedIds.length>publicationLimit}
    aria-label={publishPending?"Saving selected publish settings":"Publish selected ("+eligibleSelectedIds.length+")"}
    onClick={()=>publish(eligibleSelectedIds)}>
    {publishPending?"Saving…":<>
     <span className="apex-bulk-action-long">Publish selected ({eligibleSelectedIds.length})</span>
     <span className="apex-bulk-action-short" aria-hidden="true">Publish selected ({eligibleSelectedIds.length})</span>
    </>}
   </button>
   <button type="button" className="button secondary"
    disabled={!editable||pending||publishPending||!eligibleUnpublishIds.length||eligibleUnpublishIds.length>publicationLimit}
    aria-label={"Unpublish selected ("+eligibleUnpublishIds.length+")"}
    onClick={()=>publish(eligibleUnpublishIds,"unpublish")}>Unpublish selected ({eligibleUnpublishIds.length})</button>
   <button type="button" className="button primary"
    disabled={!editable||pending||publishPending||!eligiblePublishIds.length||eligiblePublishIds.length>publicationLimit}
    aria-label={publishPending?"Saving eligible publish settings":"Publish all eligible ("+eligiblePublishIds.length+")"}
    onClick={()=>publish(eligiblePublishIds)}>
    {publishPending?"Saving…":<>
     <span className="apex-bulk-action-long">Publish all eligible ({eligiblePublishIds.length})</span>
     <span className="apex-bulk-action-short" aria-hidden="true">Publish all ({eligiblePublishIds.length})</span>
    </>}
   </button>
  </div>
  <p className="notice">Card switches and selected actions save supplier listing preferences. Owner holds and product eligibility remain enforced. The public release gate is OFF; toggling currently does not make a product public or purchasable.</p>
  {eligiblePublishIds.length>publicationLimit&&<p role="status" className="notice">
   More than 50 eligible products loaded. Publish selected groups of up to 50.
  </p>}
  {publicationMessage&&<p role="status" className="apex-bulk-result">{publicationMessage}</p>}
  {pendingSaveRows.length>20&&<p className="notice">Pending changes will be saved in sequential batches of 20.</p>}
  {result.message&&<p role="status" className="apex-bulk-result">{result.message}</p>}
  {saveRetryKeys.length>0&&<div className="notice apex-bulk-retry-hint" role="status">
   {saveRetryKeys.length} product {saveRetryKeys.length===1?"change still needs":"changes still need"} attention.
   {viewFilter!=="save_retries"&&<button type="button" className="button secondary"
    disabled={busy} onClick={()=>{setProductSearch("");setViewFilter("save_retries");}}>
    Show unfinished
   </button>}
   <a href="#bulk-product-cards">Jump to product cards</a>.
   Return to All products to preview the full saved selection.
  </div>}
 </section>;
}
