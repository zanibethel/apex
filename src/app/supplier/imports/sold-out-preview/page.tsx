import Image from "next/image";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {formatPrivatePreviewUsd,proposedSoldOutPricing} from "@/lib/catalog/sold-out-import-pricing.mjs";
import {importDefaultDescription} from "@/lib/catalog/import-default-descriptions.mjs";
import "./sold-out-preview.css";

export const dynamic="force-dynamic";
export const metadata={
 title:"Sold-Out Product Gallery — Private Supplier Preview | Apex",
 robots:{index:false,follow:false},
};

export default async function SoldOutImportPreview(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const eligible=w.stores.filter(store=>!store.is_public&&
  w.memberships.some(m=>m.supplier_id===store.supplier_id&&
   (m.role==="owner"||m.role==="manager")));
 if(eligible.length!==1)return <main className="container supplier-shell">
  <h1>Choose one authorized private supplier store.</h1>
  <Link href="/supplier/imports">Return to import review</Link>
 </main>;
 const store=eligible[0];
 const [source,linked,art]=await Promise.all([
  w.client.from("supplier_import_candidates")
   .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status",{count:"exact"})
   .eq("store_id",store.id).order("source_index",{ascending:true}).limit(100),
  w.client.from("supplier_candidate_drafts")
   .select("candidate_id,product_id").eq("store_id",store.id).limit(100),
  w.client.from("products")
   .select("id,image_path")
   .eq("store_id",store.id).eq("is_published",false)
   .not("image_path","is",null).order("updated_at",{ascending:false}).limit(1),
 ]);
 // Do not display a truncated, cross-tenant or partially failed import.
 if(source.error||linked.error||art.error||source.count===null||
   source.count!==source.data?.length||source.count>100)
  return <main className="container supplier-shell">
   <Link href="/supplier/imports" className="back">← Import review</Link>
   <h1>Preview unavailable</h1>
   <p className="notice">Complete private source data could not be verified. Nothing was published.</p>
  </main>;
 const sourceImage=art.data?.[0]?.image_path;
 const signed=sourceImage?await w.client.storage.from("apex-draft-product-images")
  .createSignedUrl(sourceImage,120):null;
 const imageUrl=signed&&!signed.error?signed.data?.signedUrl:undefined;
 const mappings=new Set((linked.data??[]).map(item=>item.candidate_id));
 const rows=(source.data??[]).map(candidate=>({
  candidate,
  prices:proposedSoldOutPricing(candidate.wholesale_cost_cents),
  saved:mappings.has(candidate.id),
 }));
 const invalid=rows.filter(row=>row.prices===null).length;
 return <main className="container supplier-shell apex-soldout-preview">
  <Link href="/supplier/imports" className="back">← Private import review</Link>
  <p className="eyebrow">APEX / PRIVATE SUPPLIER GALLERY</p>
  <h1>Sold-out catalog preview</h1>
  <p className="lead">Your imported variants with editable draft-description suggestions in storefront-style cards, all displayed as
   sold out, using the same existing uploaded image where available.</p>
  <p className="notice"><strong>Not public or purchasable.</strong> These are
   proposed listing previews. Nothing on this page creates a product record,
   changes stock, approves a supplier import or makes a payment possible.</p>
  <div className="apex-soldout-summary" role="status">
   <span><strong>{rows.length}</strong> imported variants</span>
   <span><strong>{rows.filter(r=>r.saved).length}</strong> saved product drafts</span>
   <span><strong>{rows.filter(r=>r.candidate.review_status!=="approved_for_draft").length}</strong> require source review</span>
   <span><strong>{invalid}</strong> need price correction</span>
  </div>
  <p className="notice">Pricing formula: supplied source cost × 2 for the proposed
   selling price, × 2.5 for the proposed compare-at reference (rounded to cents).
   Compare-at amounts are <strong>not verified former selling prices</strong>,
   so no percentage-off or strike-through discount claims are displayed.
   Source cost is visible here only to authorized supplier reviewers.</p>
  {!imageUrl&&<p className="notice" role="status">The original product image could not
   be loaded from private storage. Cards show a placeholder, not an invented image.</p>}
  <div className="apex-soldout-grid">
   {rows.map(({candidate,prices,saved})=>{
    const title=[candidate.product_name,candidate.strength].filter(Boolean).join(" — ");
    return <article key={candidate.id} className="apex-offer-tile apex-soldout-card"
      aria-label={"Sold out preview: "+title}>
     <div className="apex-offer-image">
      {imageUrl?<Image src={imageUrl} alt="Shared illustrative product image"
       width={640} height={480} unoptimized
       style={{width:"100%",height:"100%",objectFit:"contain"}}/>
       :<div className="apex-offer-placeholder" role="img" aria-label="Image unavailable">
        Image pending
       </div>}
      <span className="apex-soldout-badge">SOLD OUT</span>
     </div>
     <div className="apex-offer-content">
      <p className="apex-offer-category">SOURCE #{candidate.source_index+1} · PRIVATE PREVIEW</p>
      <h2>{title}</h2>
      <details className="apex-soldout-description"><summary>Default product description</summary>
       <p>{importDefaultDescription(candidate.product_name,candidate.strength)??"Product identity pending supplier review; no verified technical description is available."}</p>
      </details>
      {prices?<div className="apex-soldout-prices">
       <strong>{formatPrivatePreviewUsd(prices.salePriceCents)}</strong>
       <span>Proposed compare-at: {formatPrivatePreviewUsd(prices.compareAtCents)}</span>
       <small>Internal source cost: {formatPrivatePreviewUsd(prices.sourceCostCents)}</small>
      </div>:<p className="notice">Source price cannot be verified.</p>}
      <p className="apex-soldout-stock">Sold out · 0 units shown in preview</p>
      <button type="button" disabled className="apex-soldout-disabled">Unavailable</button>
      <p className="apex-soldout-status">{saved?"Saved private draft":"Not yet a saved product"}
       {" · "}{candidate.review_status==="approved_for_draft"?"Reviewed for drafting":
       "Source review pending"}</p>
     </div>
    </article>;
   })}
  </div>
  <p className="notice">A gallery preview is not proof that hosted inventory
   records are zero. Any saved products must have their actual inventory
   separately reconciled before a public sold-out display can be released.
   Public product release and checkout remain disabled.</p>
  <Link href="/supplier/imports" className="button secondary">Review source records</Link>
  <Link href="/supplier/imports/bulk-drafts" className="button secondary">Prepare reviewed private drafts</Link>
 </main>;
}
