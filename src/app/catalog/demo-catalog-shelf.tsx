"use client";

import {useDemoCart} from "@/app/demo-cart";
import {DEMO_ITEMS,formatDemoUsd} from "@/lib/checkout/preview-model.mjs";

export function DemoCatalogShelf(){
 const {quantities,add,count,open}=useDemoCart();
 return <section className="apex-demo-shelf" aria-labelledby="apex-demo-shelf-title">
  <div className="apex-demo-shelf-heading">
   <div>
    <p className="eyebrow">INTERACTIVE CART TEST · FICTIONAL PRODUCTS</p>
    <h2 id="apex-demo-shelf-title">Try the shopping experience</h2>
    <p>Sample merchandise for testing only. These are not live listings or purchases.</p>
   </div>
   <button type="button" className="apex-demo-view-cart" onClick={open}>
    View demo cart ({count}) →
   </button>
  </div>
  <div className="apex-demo-product-grid">
   {DEMO_ITEMS.map(item=>{
    const qty=quantities[item.id]??0;
    return <article key={item.id} className="apex-demo-product">
     <div className="apex-demo-product-art" aria-hidden="true">
      {item.id==="demo-shirt"?"A":"▲"}
      <span>DEMO</span>
     </div>
     <div className="apex-demo-product-body">
      <p className="eyebrow">{item.category}</p>
      <h3>{item.name}</h3>
      <p>Fictional product · for UI testing only</p>
      <div className="apex-demo-product-price">
       <strong>{formatDemoUsd(item.unitCents)}</strong>
       {item.compareCents&&<s>{formatDemoUsd(item.compareCents)}</s>}
      </div>
      <button type="button" className="apex-demo-add"
       disabled={qty>=5} onClick={()=>{add(item.id);open();}}>
       {qty>=5?"Max sample quantity reached":"Add to demo cart +"}
      </button>
     </div>
    </article>;
   })}
  </div>
 </section>;
}
