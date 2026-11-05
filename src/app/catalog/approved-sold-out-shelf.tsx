"use client";

import {useState} from "react";
import Link from "next/link";
import {filterPublicCatalogPage} from "@/lib/catalog/public-browse-filter.mjs";
import type {ApprovedSoldOutProduct,SoldOutCatalogResult} from "@/lib/supabase/approved-sold-out-catalog";
import {SaveCatalogItem} from "@/app/cart/cart-provider";
import "./sold-out-catalog.css";

const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

// This component has NO cart hook, order action, invoice, form, wallet or
// individual product link. The current preview has no public product media
// feed, so it never leaks private image paths or signed supplier URLs.
export function ApprovedSoldOutShelf({result}:{result:SoldOutCatalogResult}){
 const [query,setQuery]=useState("");
 const [availability,setAvailability]=useState("all");
 const visible=filterPublicCatalogPage(result.products,{query,availability}) as ApprovedSoldOutProduct[];
 return <section className="apex-approved-soldout" aria-labelledby="apex-approved-soldout-title">
  <div className="apex-approved-soldout-head">
   <div>
    <p className="eyebrow">APEX PRODUCT CATALOG</p>
    <h2 id="apex-approved-soldout-title">Product catalog</h2>
    <p>Browse current product listings. Availability reflects verified current stock. Checkout is currently unavailable.</p>
   </div>
   <span className="apex-approved-status">Checkout unavailable</span>
  </div>
  {result.state==="connected"&&result.products.length>0&&
   <div className="apex-approved-filters">
    <label htmlFor="apex-public-product-search">Search this page
     <input id="apex-public-product-search" type="search" maxLength={64}
      placeholder="Search product names or details"
      value={query} onChange={event=>setQuery(event.target.value)}/>
    </label>
    <label htmlFor="apex-public-availability">Availability
     <select id="apex-public-availability" value={availability}
      onChange={event=>setAvailability(event.target.value)}>
      <option value="all">All products</option>
      <option value="in_stock">In stock</option>
      <option value="sold_out">Sold out</option>
     </select>
    </label>
    <p role="status" aria-live="polite">
     Showing {visible.length} of {result.products.length} products on page {result.page}.
    </p>
   </div>}
  {result.state==="connected"&&result.products.length>0?
   <>
   {visible.length===0&&<div className="apex-approved-empty" role="status">
    <h3>No matches on this page</h3>
    <p>Change the search or availability filter, or browse another page.</p>
   </div>}
   <div className="apex-approved-soldout-grid">
    {visible.map((p:ApprovedSoldOutProduct)=><article className="apex-approved-item" key={p.id}>
     <div className="apex-approved-art">
      <span className="apex-approved-triangle" aria-hidden="true">▲</span>
      <span className={"apex-approved-badge"+(p.availability==="in_stock"?" apex-approved-instock":"")}>{p.availability==="in_stock"?"IN STOCK":"SOLD OUT"}</span>
      <small>APEX ANABOLICS</small>
     </div>
     <div className="apex-approved-body">
      <p className="eyebrow">APEX COLLECTION</p>
      <h3>{p.name}</h3>
      <details className="apex-approved-description">
       <summary>Product details</summary>
       <p>{p.description}</p>
      </details>
      <div className="apex-approved-price">
       <strong>{money(p.priceCents)}</strong>
       <span>USD · Listed price</span>
      </div>
      {p.availability==="in_stock"
       ?<SaveCatalogItem id={p.id} name={p.name} actionLabel="Add to cart"/>
       :<button type="button" disabled className="apex-approved-disabled">Sold out</button>}
      <p className="apex-approved-meta">{p.availability==="in_stock"
       ?"Available stock confirmed at last refresh · checkout unavailable"
       :"Currently unavailable to order"}</p>
     </div>
    </article>)}
   </div></>:
   <div className="apex-approved-empty" role="status">
    <h3>No products available right now.</h3>
    <p>{result.state==="unavailable"?
      "The catalog is temporarily unavailable. Please check back later.":
      "Products will appear here as they become available."}</p>
   </div>}
  {result.state==="connected"&&(result.page>1||result.hasNext)&&
   <p className="apex-approved-page-note">Search and availability filters apply to the current page.</p>}
  {result.state==="connected"&&(result.page>1||result.hasNext)&&
   <nav className="apex-approved-pagination" aria-label="Approved product pages">
    {result.page>1&&<Link className="button secondary" href={"/catalog?page="+(result.page-1)}>Previous</Link>}
    <span>Page {result.page}</span>
    {result.hasNext&&<Link className="button secondary" href={"/catalog?page="+(result.page+1)}>Next</Link>}
   </nav>}
  <p className="notice">Product availability is shown for browsing. Checkout is currently unavailable.</p>
 </section>;
}
