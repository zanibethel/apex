"use client";

import Link from "next/link";
import Image from "next/image";
import {useMemo,useState} from "react";
import CompactVariantCard from "@/components/catalog/compact-variant-card";
import type {CardVariant} from "@/components/catalog/compact-variant-card";
import {SupplierParentReviewControls} from "@/app/supplier/catalog/variant-review/review-controls";
import {filterProductWorkspace,productWorkspaceStatus} from "@/lib/catalog/supplier-products-workspace.mjs";
import {SUPPLIER_OPTION_BATCH} from "@/lib/catalog/supplier-parent-review-snapshot.mjs";

export type PrivateSheetCard={
 name:string;section:string;options:CardVariant[];
 compositionByVariantId:Record<string,string>;
 held:{row:number;sourceName:string;reason:string;formula:string}[];
 canApprove:boolean;snapshotJson:string;
 reviewStatus:"approved"|"needs_changes"|"source_changed"|"pending";
};
export type PrivateSavedProduct={
 id:string;name:string;sku:string;priceCents:number;
 published:boolean;isActive:boolean;hasImage:boolean;imageUrl?:string;
 requested:boolean;adminGate:string|null;note:string|null;
};
type Props={storeId:string;sheet:PrivateSheetCard[];saved:PrivateSavedProduct[]};
const money=(cents:number)=>Number.isSafeInteger(cents)&&cents>=0?
 new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100):"—";
const labels:Record<string,string>={
 approved:"Content approved",needs_changes:"Needs changes",
 source_changed:"Review again",pending:"Awaiting review",
};
const savedLabels:Record<string,string>={
 draft:"Draft",requested:"Publish requested",held:"Admin hold",published:"Published",
};

export default function SimpleProducts({storeId,sheet,saved}:Props){
 const [kind,setKind]=useState<"sheet"|"saved">("sheet");
 const [query,setQuery]=useState("");
 const [filter,setFilter]=useState("all");
 const sourceCount=sheet.filter(x=>x.reviewStatus==="approved").length;
 const heldCount=sheet.filter(x=>x.held.length>0).length;
 const selected=kind==="sheet"?sheet:saved;
 const filtered=useMemo(()=>filterProductWorkspace(selected,query,filter,kind),
  [selected,query,filter,kind]);
 function selectKind(next:"sheet"|"saved"){
  setKind(next);setFilter("all");setQuery("");
 }
 const filters=kind==="sheet"?[
  ["all","All"],["needs_attention","Needs attention"],["approved","Approved"],
  ["draft","To review"],
 ]:[
  ["all","All"],["draft","Drafts"],["requested","Publish requested"],
  ["held","Admin holds"],
 ];
 return <section className="apex-products-workspace" aria-label="Supplier product catalog">
  <div className="apex-products-overview">
   <div><strong>{sheet.length}</strong><span>Supplier products</span></div>
   <div><strong>{sourceCount}</strong><span>Content approved</span></div>
   <div><strong>{saved.length}</strong><span>Existing drafts</span></div>
   <div><strong>{heldCount}</strong><span>Need clarification</span></div>
  </div>
  <div className="apex-products-switch" role="group" aria-label="Product collection">
   <button type="button" className={kind==="sheet"?"is-active":""}
    aria-pressed={kind==="sheet"} onClick={()=>selectKind("sheet")}>
    Supplier list <span>{sheet.length}</span>
   </button>
   <button type="button" className={kind==="saved"?"is-active":""}
    aria-pressed={kind==="saved"} onClick={()=>selectKind("saved")}>
    Saved products <span>{saved.length}</span>
   </button>
  </div>
  <div className="apex-products-toolbar">
   <label className="apex-products-search">
    <span className="sr-only">Search products and options</span>
    <input type="search" value={query}
     placeholder="Search products, sizes or SKU"
     onChange={e=>setQuery(e.target.value)} autoComplete="off"/>
   </label>
   <div className="apex-products-filters" role="group" aria-label="Filter products">
    {filters.map(([value,label])=><button type="button" key={value}
     aria-pressed={filter===value} className={filter===value?"is-active":""}
     onClick={()=>setFilter(value)}>{label}</button>)}
   </div>
  </div>
  <div className="apex-products-resultline" role="status">
   Showing {filtered.length} of {selected.length} products
  </div>
  {kind==="sheet"&&<p className="apex-products-context">
   These are the supplier&apos;s imported product options, grouped into one card
   per product. Approve the content here. Existing saved records remain separate
   until each product identity and SKU can be matched without duplicates.
  </p>}
  {kind==="saved"&&<p className="apex-products-context">
   Edit the saved product name, description, price and photo.
   The publish request does not override an administrator hold or legal requirements.
  </p>}
  {!filtered.length?<div className="apex-products-empty">
   <strong>No matching products</strong>
   <p>Try a different search or filter.</p>
   <button type="button" className="button secondary"
    onClick={()=>{setQuery("");setFilter("all");}}>Clear filters</button>
  </div>:kind==="sheet"?
   <div className="apex-products-cards">
    {(filtered as PrivateSheetCard[]).map(card=><div key={card.name}
      className="apex-products-item">
     {card.options.length>0?
      <CompactVariantCard name={card.name} category={card.section}
       variants={card.options} compositionByVariantId={card.compositionByVariantId}
       reviewMode/>:
      <article className="apex-compact-product apex-products-held-card">
       <div className="apex-compact-product-art" aria-hidden="true">▲</div>
       <div className="apex-compact-product-body">
        <p className="apex-compact-product-category">{card.section}</p>
        <h3>{card.name}</h3>
        <p className="notice">Option details need clarification.</p>
       </div>
      </article>}
     <div className="apex-products-item-actions">
      <span className={"apex-products-state state-"+card.reviewStatus}>
       {labels[card.reviewStatus]}
      </span>
      {card.held.length>0&&<p className="apex-products-hold-message">
       {card.held.length} option(s) awaiting clarification
      </p>}
      <details className="apex-products-review-details">
       <summary>Review details</summary>
       {card.held.map(h=><p className="apex-products-issue" key={h.row+"-"+h.sourceName+"-"+h.formula}>
        Source #{h.row}: {h.sourceName}{h.formula?" · "+h.formula:""}
        {h.reason?" — "+h.reason:""}
       </p>)}
       <SupplierParentReviewControls storeId={storeId}
        sourceBatch={SUPPLIER_OPTION_BATCH} parentTitle={card.name}
        snapshotJson={card.snapshotJson} canApprove={card.canApprove}
        status={labels[card.reviewStatus]}/>
      </details>
     </div>
    </div>)}
   </div>:
   <div className="apex-products-saved-list">
    {(filtered as PrivateSavedProduct[]).map(p=><article key={p.id}
     className="apex-products-saved-row">
     <div className="apex-products-saved-image">
      {p.imageUrl?<Image src={p.imageUrl} alt="" width={160} height={160}
       unoptimized style={{width:"100%",height:"100%",objectFit:"contain"}}/>:
       <span aria-hidden="true">▲</span>}
     </div>
     <div className="apex-products-saved-info">
      <h3>{p.name}</h3>
      <p>{p.sku} · {money(p.priceCents)}</p>
      <span className={"apex-products-state state-"+productWorkspaceStatus(p)}>
       {savedLabels[productWorkspaceStatus(p)]}
      </span>
      {p.adminGate==="hold"&&p.note&&<p className="apex-products-issue">{p.note}</p>}
     </div>
     <div className="apex-products-saved-actions">
      <Link className="button secondary" href={"/supplier/products/"+p.id}>Edit product</Link>
     </div>
    </article>)}
   </div>}
 </section>;
}
