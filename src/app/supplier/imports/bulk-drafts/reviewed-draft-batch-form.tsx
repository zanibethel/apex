"use client";

import {useActionState,useState} from "react";
import Link from "next/link";
import {createReviewedImportDraftBatch,type BatchDraftResult} from "./actions";
import {formatPrivatePreviewUsd} from "@/lib/catalog/sold-out-import-pricing.mjs";

type Ready={candidateId:string;name:string;sourceIndex:number;
 sourceCostCents:number;salePriceCents:number;proposedCompareAtCents:number;};
const initial:BatchDraftResult={ok:false,message:"",results:[]};
export function ReviewedDraftBatchForm({storeId,ready,enabled}:{
 storeId:string;ready:Ready[];enabled:boolean;
}){
 const [selected,setSelected]=useState<string[]>([]);
 const [result,action,pending]=useActionState(createReviewedImportDraftBatch,initial);
 const all=ready.filter(row=>selected.includes(row.candidateId));
 const atCapacity=selected.length>=10;
 return <section className="supplier-panel" style={{margin:"18px 0",maxWidth:"none"}}>
  <h2>Create reviewed drafts in batches of 10</h2>
  <p className="notice">Only previously reviewed and approved sources are selectable.
   Proposed selling price = 2× source cost; proposed compare-at = 2.5×.
   The compare-at value is not verified as a historical price. New SKUs are
   generated automatically and actual starting inventory is always zero.</p>
  {ready.length===0?<p className="notice" role="status">
   No approved, unsaved variants yet. Review source records individually before
   using this tool. This button cannot approve imports or bypass product reviews.
  </p>:<form action={action} className="supplier-form">
   <input type="hidden" name="storeId" value={storeId}/>
   <input type="hidden" name="candidateIds" value={JSON.stringify(selected)}/>
   <div style={{display:"grid",gap:10,maxHeight:420,overflowY:"auto",padding:4}}>
    {ready.map(row=><label key={row.candidateId}
     style={{display:"flex",gap:12,alignItems:"flex-start",padding:10,
      border:"1px solid #40343f",borderRadius:9}}>
     <input type="checkbox" checked={selected.includes(row.candidateId)}
      disabled={!enabled||pending||(!selected.includes(row.candidateId)&&atCapacity)}
      onChange={e=>setSelected(previous=>e.target.checked
       ?[...previous,row.candidateId]:previous.filter(id=>id!==row.candidateId))}/>
     <span><strong>{row.name}</strong><small style={{display:"block"}}>
      Source #{row.sourceIndex+1} · Internal cost {formatPrivatePreviewUsd(row.sourceCostCents)}
      {" · "}Proposed sell {formatPrivatePreviewUsd(row.salePriceCents)}
      {" · "}Compare-at {formatPrivatePreviewUsd(row.proposedCompareAtCents)}
     </small></span>
    </label>)}
   </div>
   <p className="notice">{selected.length}/10 selected · Drafts remain private,
    unlisted, non-purchasable, and out of stock.</p>
   <label style={{display:"flex",gap:10,alignItems:"flex-start"}}>
    <input type="checkbox" name="reviewConfirmed" value="yes" required disabled={!enabled||pending}/>
    <span>I have confirmed these source variants were individually reviewed.
     I want to create private zero-stock drafts with the proposed pricing.</span>
   </label>
   <button type="submit" className="button primary"
    disabled={!enabled||pending||selected.length===0}>
    {pending?"Preparing reviewed drafts…":`Create ${selected.length} private drafts`}
   </button>
  </form>}
  {!enabled&&<p className="notice">Supplier draft writes are disabled in this deployment.</p>}
  {result.message&&<div role="status" className="notice">
   <strong>{result.message}</strong>
   {result.results.length>0&&<ul>
    {result.results.map(r=><li key={r.candidateId}>
     {r.message} {r.created&&r.productId&&<Link
      href={"/supplier/catalog/preview/"+r.productId}>Review saved private offer</Link>}
    </li>)}
   </ul>}
   <p>Refresh this page to update the ready list after saving.</p>
  </div>}
 </section>;
}
