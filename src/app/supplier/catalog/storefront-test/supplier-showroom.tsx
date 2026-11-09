"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {OfferTile} from "@/components/catalog/offer-tile";
import {initialShowroomState,showroomVisible,showroomCartSummary} from "@/lib/catalog/supplier-showroom-preview.mjs";
import "./showroom.css";

export type ShowroomProduct={
 id:string;name:string;sku:string;description:string|null;category:string;
 priceCents:number;compareAtCents:number|null;currency:string;active:boolean;
 initialInStock:boolean;trackingEnabled:boolean;imageUrl?:string;
};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
export function SupplierShowroom({products}:{products:ShowroomProduct[]}){
 type PreviewState=Record<string,{visible:boolean;inStock:boolean}>;
 const defaultState=()=>initialShowroomState(products) as PreviewState;
 const [state,setState]=useState<PreviewState>(defaultState);
 const [cart,setCart]=useState<Record<string,number>>({});
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("");
 const [controlsOpen,setControlsOpen]=useState(true);
 const categories=useMemo(()=>[...new Set(products.map(p=>p.category))].sort(),[products]);
 const rows=useMemo(()=>products.filter(p=>
  (!category||p.category===category)&&
  (!query.trim()||[p.name,p.sku,p.category].some(x=>x.toLowerCase().includes(query.trim().toLowerCase())))
 ),[products,query,category]);
 const visible=showroomVisible(products,state,query,category) as ShowroomProduct[];
 const summary=showroomCartSummary(products,state,cart);
 function change(id:string,property:"visible"|"inStock",value:boolean){
  setState(current=>({...current,[id]:{
   ...current[id],visible:property==="visible"?value:current[id]?.visible??false,
   inStock:property==="inStock"?value:current[id]?.inStock??false,
  }}));
  if(!value)setCart(current=>{const copy={...current};delete copy[id];return copy;});
 }
 function add(id:string){
  if(!state[id]?.visible||!state[id]?.inStock)return;
  setCart(current=>({...current,[id]:Math.min(10,(current[id]??0)+1)}));
 }
 function reset(){
  setState(defaultState());
  setCart({});
  setQuery("");
  setCategory("");
 }
 return <section className="apex-showroom" aria-label="Private supplier storefront simulator">
  <div className="apex-showroom-intro">
   <p className="eyebrow">SUPPLIER-ONLY STOREFRONT TEST</p>
   <h1>Customer layout preview</h1>
   <p><Link className="button primary" href="/supplier/catalog/bulk?new=1#apex-product-workspace">+ Add product to supplier catalog</Link></p>
   <p>Review your saved product cards, toggle preview visibility and stock, and try the cart appearance. Everything here is a <strong>private, local simulation</strong> — no public product publishing, inventory update, order, or payment is performed.</p>
  </div>
  <div className="apex-showroom-toolbar">
   <label>Find a product
    <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     placeholder="Name, SKU or category" maxLength={100}/></label>
   <label>Category
    <select value={category} onChange={e=>setCategory(e.target.value)}>
     <option value="">All categories</option>
     {categories.map(c=><option value={c} key={c}>{c}</option>)}
    </select></label>
   <button type="button" onClick={reset}>Reset preview</button>
  </div>
  <section className="apex-showroom-controls" aria-label="Supplier preview controls">
   <button type="button" className="apex-showroom-panel-toggle"
    aria-expanded={controlsOpen} onClick={()=>setControlsOpen(x=>!x)}>
    {controlsOpen?"Hide":"Show"} preview controls · {products.length} saved products
   </button>
   {controlsOpen&&<>
    <p className="notice"><strong>Show product</strong> controls only this private customer-style preview. <strong>In stock</strong> changes only the simulated tile and test cart. Changes reset when this page is refreshed.</p>
    <div className="apex-showroom-control-list">
     {rows.map(p=><div className="apex-showroom-control-row" key={p.id}>
      <div><strong>{p.name}</strong><small>{p.sku} · {p.active?"Saved as active":"Saved as inactive"} · {p.trackingEnabled?"Stock tracked":"Stock not tracked"}</small></div>
      <label className="apex-showroom-check">
       <input type="checkbox" checked={state[p.id]?.visible??false}
        onChange={e=>change(p.id,"visible",e.target.checked)}/>
       Show product
      </label>
      <label className="apex-showroom-check">
       <input type="checkbox" checked={state[p.id]?.inStock??false}
        onChange={e=>change(p.id,"inStock",e.target.checked)}/>
       In stock
      </label>
     </div>)}
     {!rows.length&&<p>No saved products match your filter.</p>}
    </div>
   </>}
  </section>
  <div className="apex-showroom-results">
   <div><p className="eyebrow">CUSTOMER-FACING LAYOUT SIMULATION</p>
    <h2>Products</h2>
    <p role="status">{visible.length} of {products.length} saved products visible in this preview.</p>
   </div>
   <aside className="apex-showroom-cart" aria-label="Simulated cart">
    <strong>Test cart · {summary.count} item{summary.count===1?"":"s"}</strong>
    <p>Subtotal: {money(summary.subtotalCents)}</p>
    {summary.items.length>0&&<ul>{summary.items.map(i=><li key={i.id}>{i.name} × {i.quantity}</li>)}</ul>}
    <span>Preview only · No checkout or payment</span>
   </aside>
  </div>
  {visible.length===0?<p className="apex-showroom-empty">No products shown. Turn on “Show product” or change the search filter.</p>:
   <div className="apex-offer-gallery">
    {visible.map(p=><div className="apex-offer-gallery-item apex-showroom-card" key={p.id}>
     <OfferTile name={p.name} sku={p.sku} description={p.description}
      category={p.category} priceCents={p.priceCents}
      compareAtCents={p.compareAtCents} currency={p.currency}
      imageUrl={p.imageUrl} availableStock={state[p.id]?.inStock?1:0}/>
     <div className="apex-showroom-card-actions">
      <span className={"apex-showroom-state "+(state[p.id]?.inStock?"available":"unavailable")}>
       {state[p.id]?.inStock?"In stock":"Out of stock"}
      </span>
      <button type="button" disabled={!state[p.id]?.inStock||(cart[p.id]??0)>=10}
       onClick={()=>add(p.id)}> {state[p.id]?.inStock?"Add to test cart":"Sold out"}</button>
      <Link href={"/supplier/catalog/bulk?edit="+encodeURIComponent(p.id)}>
       Edit saved product
      </Link>
     </div>
    </div>)}
   </div>}
  <p className="notice">Actual supplier publish requests, release eligibility, live inventory, and checkout remain unchanged. The real public catalog continues to follow independent product approvals.</p>
 </section>;
}
