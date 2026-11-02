import type {SoldOutCatalogResult} from "@/lib/supabase/approved-sold-out-catalog";
import "./sold-out-catalog.css";

const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

// This component has NO cart hook, order action, invoice, form, wallet or
// individual product link. The current preview has no public product media
// feed, so it never leaks private image paths or signed supplier URLs.
export function ApprovedSoldOutShelf({result}:{result:SoldOutCatalogResult}){
 return <section className="apex-approved-soldout" aria-labelledby="apex-approved-soldout-title">
  <div className="apex-approved-soldout-head">
   <div>
    <p className="eyebrow">PUBLIC CATALOG / READ-ONLY</p>
    <h2 id="apex-approved-soldout-title">Product catalog</h2>
    <p>Products appear here only after independent supplier, product and
     publication authorization. Items displayed in this section are unavailable
     for purchase.</p>
   </div>
   <span className="apex-approved-status">Purchases disabled</span>
  </div>
  {result.state==="connected"&&result.products.length>0?
   <div className="apex-approved-soldout-grid">
    {result.products.map(p=><article className="apex-approved-item" key={p.id}>
     <div className="apex-approved-art">
      <span className="apex-approved-triangle" aria-hidden="true">▲</span>
      <span className="apex-approved-badge">SOLD OUT</span>
      <small>Approved product imagery pending</small>
     </div>
     <div className="apex-approved-body">
      <p className="eyebrow">RELEASED CATALOG · UNAVAILABLE</p>
      <h3>{p.name}</h3>
      <details className="apex-approved-description">
       <summary>Product details</summary>
       <p>{p.description}</p>
      </details>
      <div className="apex-approved-price">
       <strong>{money(p.priceCents)}</strong>
       <span>USD · Listed price</span>
      </div>
      <button type="button" disabled className="apex-approved-disabled">
       Sold out
      </button>
      <p className="apex-approved-meta">No checkout or payment available</p>
     </div>
    </article>)}
   </div>:
   <div className="apex-approved-empty" role="status">
    <h3>No approved listings available yet.</h3>
    <p>{result.state==="unavailable"?
      "The approved catalog is temporarily unavailable. No products are shown without a verified release decision.":
      "The supplier and product release review is still in progress. Unverified imports and private product drafts are not displayed here."}</p>
   </div>}
  <p className="notice">Availability in this read-only gallery does not authorize
   purchasing. Source costs, private stock counts, supplier documents and
   payment details are never displayed.</p>
 </section>;
}
