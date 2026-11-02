"use client";

import Image from "next/image";
import Link from "next/link";
import {useActionState,useMemo,useState} from "react";
import {updateBulkSourceReviews,type BulkReviewResult} from "./actions";
import {formatPrivatePreviewUsd} from "@/lib/catalog/sold-out-import-pricing.mjs";
import {SOURCE_REVIEW_BATCH_LIMIT} from "@/lib/catalog/bulk-source-review.mjs";

export type ReviewRow={
 id:string;sourceIndex:number;name:string;strength:string;status:string;
 linked:boolean;costCents:number|null;retailCents:number|null;
 compareAtCents:number|null;description:string|null;
 needsIdentityCheck:boolean;validForDraft:boolean;
};
const initial:BulkReviewResult={ok:false,message:"",results:[]};
const stateLabel=(state:string)=>state==="approved_for_draft"?"Ready for draft":
 state==="under_review"?"Under review":state==="hold"?"On hold":"Unverified";

export function BulkSourceReviewPanel({storeId,rows,sharedImage,enabled}:{
 storeId:string;rows:ReviewRow[];sharedImage?:string;enabled:boolean;
}){
 const [selected,setSelected]=useState<string[]>([]);
 const [verified,setVerified]=useState<string[]>([]);
 const [action,setAction]=useState("under_review");
 const [filter,setFilter]=useState("all");
 const [search,setSearch]=useState("");
 const [overall,setOverall]=useState(false);
 const [state,submit,pending]=useActionState(updateBulkSourceReviews,initial);
 const visible=useMemo(()=>rows.filter(r=>{
  const stateMatches=filter==="all"||
   (filter==="saved"?r.linked:!r.linked&&r.status===filter);
  const match=(r.name+" "+r.strength+" "+r.sourceIndex).toLowerCase()
   .includes(search.trim().toLowerCase());
  return stateMatches&&match;
 }),[rows,filter,search]);
 const chosen=rows.filter(r=>selected.includes(r.id));
 const approvalsReady=chosen.length>0&&chosen.every(r=>
  r.validForDraft&&r.costCents!==null&&verified.includes(r.id));
 const canSubmit=enabled&&!pending&&chosen.length>0&&
  (action!=="approved_for_draft"||(approvalsReady&&overall));
 const batch=JSON.stringify({action,rows:chosen.map(r=>({
  id:r.id,status:r.status,costCents:r.costCents,checked:verified.includes(r.id),
 }))});
 const selectedCount=selected.length;
 const allVisible=visible.filter(r=>!r.linked&&r.costCents!==null);
 const selectVisible=()=>setSelected(old=>{
  const next=new Set(old);
  for(const row of allVisible){
   if(next.size>=SOURCE_REVIEW_BATCH_LIMIT)break;
   next.add(row.id);
  }
  return [...next];
 });
 const toggle=(id:string,checked:boolean)=>{
  setSelected(old=>checked?[...old,id]:old.filter(key=>key!==id));
  if(!checked)setVerified(old=>old.filter(key=>key!==id));
  setOverall(false);
 };
 return <section className="apex-import-review">
  <div className="apex-review-toolbar">
   <label>Find imported variant
    <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
     placeholder="Name, strength, or source number"/>
   </label>
   <label>Review status
    <select value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="all">All imported items</option>
     <option value="unverified">Unverified</option>
     <option value="under_review">Under review</option>
     <option value="hold">On hold</option>
     <option value="approved_for_draft">Ready for draft</option>
     <option value="saved">Already saved as draft</option>
    </select>
   </label>
  </div>
  <div className="apex-review-tools">
   <span role="status">{visible.length} visible · {selectedCount}/{SOURCE_REVIEW_BATCH_LIMIT} selected</span>
   <button type="button" className="button secondary"
    disabled={!enabled||pending||allVisible.length===0}
    onClick={selectVisible}>Select visible (up to 20)</button>
   <button type="button" className="button secondary" disabled={!selectedCount||pending}
    onClick={()=>{setSelected([]);setVerified([]);setOverall(false);}}>Clear selection</button>
  </div>
  <div className="apex-review-grid">
   {visible.map(r=>{
    const isSelected=selected.includes(r.id);
    const isVerified=verified.includes(r.id);
    const disabled=r.linked||r.costCents===null||!enabled||pending||
     (!isSelected&&selectedCount>=SOURCE_REVIEW_BATCH_LIMIT);
    return <article key={r.id} className={"apex-review-card"+(isSelected?" is-selected":"")}>
     <div className="apex-review-card-head">
      <label className="apex-review-pick">
       <input type="checkbox" checked={isSelected} disabled={disabled}
        onChange={event=>toggle(r.id,event.target.checked)}
        aria-label={"Select "+r.name+" "+r.strength}/>
       <span>Source #{r.sourceIndex+1}</span>
      </label>
      <span className="apex-review-status">{r.linked?"Saved draft":stateLabel(r.status)}</span>
     </div>
     <div className="apex-review-summary">
      {sharedImage?<div className="apex-review-image">
       <Image src={sharedImage} alt="Shared illustrative image, not a verified photo of this variant"
        width={96} height={96} unoptimized/>
      </div>:null}
      <div className="apex-review-summary-text">
       <h3>{r.name} — {r.strength}</h3>
       <p>Source cost: <strong>{r.costCents===null?"Not verified":formatPrivatePreviewUsd(r.costCents)}</strong></p>
       <p>Suggested sale: <strong>{r.retailCents===null?"Unavailable":formatPrivatePreviewUsd(r.retailCents)}</strong></p>
       <p>Proposed compare-at: {r.compareAtCents===null?"Unavailable":formatPrivatePreviewUsd(r.compareAtCents)}</p>
      </div>
     </div>
     <details className="apex-review-description">
      <summary>Read default description and checks</summary>
      <p>{r.description??"No verified description available."}</p>
      {r.needsIdentityCheck&&<p><strong>Extra identity check required:</strong> confirm the exact
       supplier identifier, blend composition or strength before any approval.</p>}
      <p>Proposed compare-at is not a verified former price. Shared image is illustrative
       until product-specific imagery is verified.</p>
     </details>
     {isSelected&&<label className="apex-review-verify">
      <input type="checkbox" checked={isVerified}
       disabled={!enabled||pending} onChange={e=>{
        setVerified(old=>e.target.checked?[...old,r.id]:old.filter(id=>id!==r.id));
        setOverall(false);
       }}/>
      <span>I verified this item's name, strength, cost and source documentation.</span>
     </label>}
     {r.linked&&<p className="apex-review-linked">Already in private product drafts ·
      <Link href="/supplier/catalog/bulk"> edit saved details</Link></p>}
    </article>;
   })}
  </div>
  <form action={submit} className="apex-review-footer">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="batch" value={batch}/>
   <div className="apex-review-action-row">
    <label>Update selected sources
     <select value={action} disabled={!enabled||pending}
      onChange={e=>{setAction(e.target.value);setOverall(false);}}>
      <option value="under_review">Mark under review</option>
      <option value="hold">Place on hold</option>
      <option value="approved_for_draft">Approve for PRIVATE draft creation</option>
     </select>
    </label>
    <span>Changes are auditable. They do not publish products.</span>
   </div>
   {action==="approved_for_draft"&&<>
    <p className="notice">To approve, check the individual verification box
     on <strong>every selected record</strong>. Approval only permits a private draft;
     it does not certify authorization for sale, verify inventory or enable checkout.</p>
    <label className="apex-review-confirm">
     <input type="checkbox" name="verifiedSourceRecords" value="yes"
      checked={overall} onChange={e=>setOverall(e.target.checked)}
      disabled={!enabled||pending||!approvalsReady}/>
     <span>I confirm the selected source records were individually reviewed
      against supplier documentation.</span>
    </label>
   </>}
   <button className="button primary" type="submit" disabled={!canSubmit}>
    {pending?"Saving reviewed statuses…":`Apply to ${selectedCount} selected entries`}
   </button>
   {state.message&&<div className="notice" role="status">
    <strong>{state.message}</strong>
    {state.results.filter(r=>!r.ok).length>0&&<p>
     {state.results.filter(r=>!r.ok).length} rows could not be saved. Refresh
     before retrying to avoid stale changes.</p>}
    <p>After approval, open <Link href="/supplier/imports/bulk-drafts">
     Create reviewed zero-stock drafts</Link>. Refresh this page to see saved statuses.</p>
   </div>}
   <p className="notice">Source review and draft creation never open the public
    storefront or make a product purchasable. No Bitcoin invoices are created.</p>
  </form>
 </section>;
}
