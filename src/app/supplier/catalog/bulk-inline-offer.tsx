"use client";

import Link from "next/link";
import {OfferTile} from "@/components/catalog/offer-tile";
import {previewUsdCents,previewCompareAtCents} from "@/lib/catalog/offer-preview-money.mjs";
import type {BulkEditRow} from "./bulk-editor";

// This is a local visual simulation of the edit fields, not an authoritative
// published/saleable listing or an indication of actual saved database state.
export function BulkInlineOffer({row,category,imageUrl,availableStock,
 canPublish=false,requested=false,publishing=false,onPublish,
 publicationMessage,publicationNote}:{
 row:BulkEditRow;category:string;imageUrl?:string;availableStock?:number;
 canPublish?:boolean;requested?:boolean;publishing?:boolean;onPublish?:()=>void;
 publicationMessage?:string;publicationNote?:string;
}){
 const priceCents=previewUsdCents(row.price);
 const compareAtCents=previewCompareAtCents(priceCents,row.comparePrice);
 const saved=Boolean(row.id)&&!row.needsSave;
 return <section className="apex-bulk-inline-preview" aria-label={"Live offer tile preview: "+(row.name||"New product")}>
  <div className="apex-bulk-inline-preview-header">
   <strong>Offer tile preview</strong>
   <span className={saved?"apex-bulk-preview-saved":"apex-bulk-preview-unsaved"}>
    {saved?"SAVED · PRIVATE":"UNSAVED · DRAFT"}
   </span>
  </div>
  <OfferTile name={row.name.trim()||"Product title"}
   sku={row.sku.trim()||"SKU pending"} description={row.description}
   category={category} priceCents={priceCents}
   compareAtCents={compareAtCents} imageUrl={imageUrl}
   currency="USD" availableStock={availableStock}/>
  <p className="apex-bulk-inline-caption">
   {saved
    ?"This is a private offer preview. It is not publicly visible."
    :"Live preview of your current edits. Save the selected product before its individual or group publication preview."}
  </p>
  {saved
   ?<div className="apex-bulk-inline-publish-actions">
     <Link href={"/supplier/catalog/preview/"+row.id}
      className="button secondary apex-bulk-preview-link">Full preview</Link>
     <button type="button" className="button primary"
      disabled={!canPublish||requested||publishing||!onPublish}
      onClick={onPublish}>
      {publishing?"Saving request…":requested?"Publication requested":"Publish"}
     </button>
    </div>
   :<p className="apex-bulk-inline-save-hint">Select this row and choose Save selected to continue.</p>}
  {publicationNote&&<p className="apex-bulk-inline-save-hint">{publicationNote}</p>}
  {publicationMessage&&<p role="status" className="apex-bulk-publish-feedback">{publicationMessage}</p>}
 </section>;
}
