"use client";

import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {useCustomerCart} from "./cart-provider";
import {DeliveryDetailsForm} from "./delivery-details-form";
import "./customer-cart.css";

type QuoteLine={productId:string;name:string;quantity:number;
 unitPriceCents:number;lineTotalCents:number;availability:"sold_out"};
type Review={
 ok:boolean;reason?:string;status?:string;
 items?:QuoteLine[];merchandiseSubtotalCents?:number;
 merchandiseDiscountCents?:number;discountedMerchandiseCents?:number;
 shippingBoxSize?:string;shippingCents?:number;envelopeMaxItems?:number;
 freeShippingMinimumCents?:number;
 amountUntilFreeShippingCents?:number;freeShippingReason?:string;
 totalCents?:number;canPlaceOrder?:false;canPay?:false;
};
const usd=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);

export function CustomerCartPage(){
 const {items,count,ready,setQuantity,remove,clear}=useCustomerCart();
 const boxSize="auto" as const;
 const [enteredCode,setEnteredCode]=useState("");
 const [code,setCode]=useState("");
 const [response,setResponse]=useState<{key:string;review:Review}|null>(null);
 const key=useMemo(()=>JSON.stringify({items,boxSize,code}),[items,boxSize,code]);
 const review=response?.key===key?response.review:null;
 useEffect(()=>{
  if(!ready||!items.length)return;
  const controller=new AbortController();
  fetch("/api/cart/quote",{
   method:"POST",cache:"no-store",signal:controller.signal,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({items,boxSize,code}),
  }).then(async result=>{
   const data:Review=await result.json();
   if(!controller.signal.aborted)setResponse({key,review:data});
  }).catch(()=>{
   if(!controller.signal.aborted)setResponse({
    key,review:{ok:false,reason:"Cart verification is temporarily unavailable."},
   });
  });
  return ()=>controller.abort();
 },[ready,key,items,boxSize,code]);
 const applyCode=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const cleaned=enteredCode.trim().toUpperCase();
  if(cleaned&&!/^[A-Z0-9_-]{3,24}$/.test(cleaned))return;
  setCode(cleaned);
 };
 const lines=review?.ok?review.items??[]:[];
 const selectedBox=review?.ok?review.shippingBoxSize:null;
 return <main className="container apex-customer-cart">
  <Link href="/catalog" className="back">← Continue shopping</Link>
  <p className="eyebrow">APEX ANABOLICS / CART</p>
  <h1>Your cart</h1>
  <p className="apex-cart-note">Your selections are saved on this device.
   Prices, promotion eligibility and availability are checked against saved catalog records.
   Checkout is currently unavailable.</p>
  {!ready?<p role="status">Loading cart…</p>:items.length===0?
   <section className="apex-customer-empty">
    <h2>Your cart is empty</h2>
    <p>Explore the catalog to save items for review.</p>
    <Link className="button primary" href="/catalog">Browse products</Link>
   </section>:
   <div className="apex-customer-cart-layout">
    <section aria-label="Selected products" className="apex-customer-items">
     <div className="apex-customer-section-title">
      <h2>{count} {count===1?"item":"items"} saved</h2>
      <button type="button" onClick={clear}>Clear cart</button>
     </div>
     {items.map(item=>{
      const verified=lines.find(line=>line.productId===item.product_id);
      return <article key={item.product_id} className="apex-customer-line">
       <div className="apex-customer-symbol" aria-hidden="true">▲</div>
       <div className="apex-customer-line-info">
        <strong>{verified?.name??"Saved catalog item"}</strong>
        <span>{verified?"Sold out — cannot be ordered":
         "Pending current product and inventory verification"}</span>
        <div className="apex-customer-qty">
         <button type="button" aria-label="Decrease quantity"
          onClick={()=>setQuantity(item.product_id,item.quantity-1)}>−</button>
         <output aria-label="Quantity">{item.quantity}</output>
         <button type="button" aria-label="Increase quantity" disabled={item.quantity>=10||count>=50}
          onClick={()=>setQuantity(item.product_id,item.quantity+1)}>+</button>
         <button className="apex-customer-remove" type="button"
          onClick={()=>remove(item.product_id)}>Remove</button>
        </div>
       </div>
       <strong>{verified?usd(verified.lineTotalCents):"—"}</strong>
      </article>;
     })}
     <DeliveryDetailsForm items={items} shippingMethod={selectedBox==="medium"?"medium":"small"}/>
    </section>
    <aside className="apex-customer-summary" aria-label="Cart summary">
     <h2>Order summary</h2>
     <section className="apex-customer-shipping" aria-label="Automatic USPS shipping">
      <strong>USPS Priority Mail shipping</strong>
      <p className="apex-cart-note" aria-live="polite">
       {selectedBox==="medium"?"Medium Flat Rate Box (automatically selected)":
        selectedBox==="small"?"Padded Flat Rate Envelope (automatically selected)":
        "Packaging is selected automatically after inventory and pricing verification."}
      </p>
      {review?.ok&&<p className="apex-cart-note">Up to {review.envelopeMaxItems} items:
       padded envelope; above that: Medium box.</p>}
     </section>
     <p className="apex-cart-note">Packaging is subject to fit confirmation.
      Merchandise over $200 after discounts qualifies for free shipping.</p>
     <form onSubmit={applyCode} className="apex-customer-code">
      <label htmlFor="apex-cart-discount">Discount or free-shipping code</label>
      <div><input id="apex-cart-discount" maxLength={24} autoCapitalize="characters"
       autoCorrect="off" spellCheck={false} value={enteredCode}
       placeholder="Enter code" onChange={e=>setEnteredCode(e.target.value)}/>
       <button type="submit">Apply</button></div>
      {code&&<button className="apex-customer-remove" type="button"
       onClick={()=>{setCode("");setEnteredCode("");}}>Remove code</button>}
     </form>
     {review===null?<p role="status" className="apex-cart-note">Checking current catalog and prices…</p>:
      !review.ok?<p role="status" className="apex-cart-validation">{review.reason??"Cart verification unavailable."}</p>:
      <div className="apex-customer-totals" aria-live="polite">
       <div><span>Merchandise</span><strong>{usd(review.merchandiseSubtotalCents??0)}</strong></div>
       <div><span>Discount</span><strong>−{usd(review.merchandiseDiscountCents??0)}</strong></div>
       <div><span>USPS shipping</span><strong>{review.shippingCents===0?"Free":usd(review.shippingCents??0)}</strong></div>
       <div className="apex-customer-total"><span>Estimated total</span>
        <strong>{usd(review.totalCents??0)}</strong></div>
       {(review.amountUntilFreeShippingCents??0)>0&&
        <p className="apex-cart-note">Add {usd(review.amountUntilFreeShippingCents??0)}
         more merchandise after discounts for free shipping.</p>}
       <p className="apex-cart-validation">Items are sold out. No order or payment can be placed.</p>
      </div>}
     <button type="button" className="apex-customer-checkout" disabled>
      Checkout unavailable
     </button>
     <Link href="/catalog" className="apex-customer-return">Continue shopping</Link>
    </aside>
   </div>}
 </main>;
}
