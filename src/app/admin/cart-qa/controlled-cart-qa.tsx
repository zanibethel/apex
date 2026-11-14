"use client";

import {useEffect,useMemo,useState} from "react";

type Line={productId:string;name:string;quantity:number;unitPriceCents:number;
 lineTotalCents:number;availability:"in_stock"|"insufficient_stock"|"sold_out"};
type Review={ok:boolean;reason?:string;status?:string;items?:Line[];
 merchandiseSubtotalCents?:number;merchandiseDiscountCents?:number;
 discountedMerchandiseCents?:number;shippingBoxSize?:string;
 shippingCents?:number;freeShippingMinimumCents?:number|null;
 amountUntilFreeShippingCents?:number|null;totalCents?:number;
 canPlaceOrder?:false;canPay?:false;synthetic?:true;availableUnits?:number};
const PRODUCT_ID="f4000000-0000-4000-8000-000000000201";
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

export function ControlledCartQa(){
 const [quantity,setQuantity]=useState(0);
 const [code,setCode]=useState("");
 const [revision,setRevision]=useState(0);
 const [response,setResponse]=useState<{key:string;review:Review}|null>(null);
 const key=useMemo(()=>JSON.stringify({quantity,code,revision}),[quantity,code,revision]);
 const review=response?.key===key?response.review:null;
 useEffect(()=>{
  if(quantity===0)return;
  const controller=new AbortController();
  fetch("/api/admin/cart-qa/quote",{
   method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.signal,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({items:[{product_id:PRODUCT_ID,quantity}],code,boxSize:"auto"}),
  }).then(async res=>{
   const parsed:Review=await res.json();
   if(!controller.signal.aborted)setResponse({key,review:parsed});
  }).catch(()=>{
   if(!controller.signal.aborted)setResponse({key,review:{
    ok:false,reason:"Test quote unavailable. Please recheck.",canPlaceOrder:false,canPay:false,
   }});
  });
  return ()=>controller.abort();
 },[key,quantity,code]);
 const line=review?.ok?review.items?.[0]:null;
 const inStock=line?.availability==="in_stock";
 return <div className="apex-cart-qa-layout">
  <section className="supplier-panel apex-cart-qa-product" aria-label="Controlled synthetic product">
   <p className="eyebrow">FIXTURE · IN STOCK UP TO FOUR UNITS</p>
   <div className="apex-cart-qa-art" aria-hidden="true"><span>QA</span></div>
   <h2>QA Fitness Water Bottle</h2>
   <p className="notice">Synthetic test product. Not in the supplier catalog and not available for purchase.</p>
   <p className="apex-cart-qa-price">Server price: <strong>{line?money(line.unitPriceCents):"Checked on add"}</strong></p>
   {quantity===0?
    <button type="button" className="button primary" onClick={()=>setQuantity(1)}>
     Add to Cart (test)</button>:
    <>
     <div className="apex-cart-qa-qty">
      <button type="button" aria-label="Decrease test quantity"
       onClick={()=>setQuantity(current=>Math.max(0,current-1))}>−</button>
      <output aria-label="Test quantity">{quantity}</output>
      <button type="button" aria-label="Increase test quantity"
       disabled={quantity>=10} onClick={()=>setQuantity(current=>Math.min(10,current+1))}>+</button>
      <button type="button" className="button secondary" onClick={()=>setQuantity(0)}>Remove</button>
     </div>
     <p role="status" aria-live="polite" className={line&&!inStock?"apex-cart-qa-warning":"notice"}>
      {!review?"Checking server-side stock…":
       !review.ok?review.reason:
       inStock?"In stock — requested quantity can be filled in this synthetic test":
       "Insufficient stock — the server rejected the requested quantity of "+quantity}
     </p>
    </>}
   <p className="notice">Try 1–4 units (in stock), then 5 units (insufficient stock). Each change requests a new server quote.</p>
  </section>
  <aside className="supplier-panel apex-cart-qa-summary" aria-label="Synthetic cart quote">
   <h2>Test order summary</h2>
   <label htmlFor="qa-discount">Test discount code
    <select id="qa-discount" value={code} onChange={e=>setCode(e.target.value)}>
     <option value="">No discount</option>
     <option value="TEST10">TEST10 — 10% off</option>
     <option value="SHIPFREE">SHIPFREE — free shipping</option>
     <option value="BADCODE">BADCODE — invalid code test</option>
    </select>
   </label>
   <button type="button" className="button secondary" disabled={quantity===0}
    onClick={()=>setRevision(v=>v+1)}>Recheck price &amp; inventory</button>
   {quantity===0?<p className="notice">Add the test product to begin.</p>:
    review===null?<p className="notice" role="status">Rechecking server prices, shipping and stock…</p>:
    !review.ok?<p role="alert" className="apex-cart-qa-warning">{review.reason}</p>:
    <div className="apex-cart-qa-totals" aria-live="polite">
     <div><span>Unit price</span><strong>{money(line?.unitPriceCents??0)}</strong></div>
     <div><span>Quantity</span><strong>{quantity}</strong></div>
     <div><span>Merchandise</span><strong>{money(review.merchandiseSubtotalCents??0)}</strong></div>
     <div><span>Discount</span><strong>−{money(review.merchandiseDiscountCents??0)}</strong></div>
     <div><span>USPS packaging</span><strong>{review.shippingBoxSize==="medium"?"Medium box":"Padded envelope"}</strong></div>
     <div><span>USPS shipping</span><strong>{review.shippingCents===0?"Free":money(review.shippingCents??0)}</strong></div>
     <div className="apex-cart-qa-total"><span>Estimated total</span><strong>{money(review.totalCents??0)}</strong></div>
     {(review.amountUntilFreeShippingCents??0)>0&&
      <p className="notice">Add {money(review.amountUntilFreeShippingCents??0)}
       after discounts to qualify for the test free-shipping threshold.</p>}
     <p className="notice">Stock check: <strong>{inStock?"PASS":"INSUFFICIENT"}</strong>.
      Test available quantity: {review.availableUnits??4}.
      Both order and payment permissions remain disabled.</p>
    </div>}
   <button type="button" className="apex-customer-checkout" disabled>
    Checkout unavailable — QA only
   </button>
   <p className="notice">Try 3 units for automatic Medium packaging. Try 4 units for the free-shipping threshold, then TEST10 or SHIPFREE. Nothing is reserved or purchased.</p>
  </aside>
 </div>;
}
