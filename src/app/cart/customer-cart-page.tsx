"use client";

import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {useCustomerCart} from "./cart-provider";
import {DeliveryDetailsForm} from "./delivery-details-form";
import {NonpayableOrderPanel} from "./nonpayable-order-panel";
import "./customer-cart.css";

type QuoteLine={productId:string;name:string;quantity:number;
 unitPriceCents:number;lineTotalCents:number;availability:"sold_out"|"in_stock"|"insufficient_stock"};
type Review={
 ok:boolean;reason?:string;status?:string;
 items?:QuoteLine[];merchandiseSubtotalCents?:number;
 merchandiseDiscountCents?:number;discountedMerchandiseCents?:number;
 shippingBoxSize?:string;shippingCents?:number;envelopeMaxItems?:number;
 freeShippingMinimumCents?:number|null;
 amountUntilFreeShippingCents?:number|null;freeShippingReason?:string;
 totalCents?:number;canPlaceOrder?:false;canPay?:false;
};
const usd=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(n/100);

type DeliveryDetails={
 firstName:string;lastName:string;email:string;phone:string;address1:string;
 address2:string;city:string;state:string;postalCode:string;
};
export function CustomerCartPage({
 nonpayableEnabled=false,signedIn=false,
}:{nonpayableEnabled?:boolean;signedIn?:boolean}={}){
 const {items,count,ready,setQuantity,remove,clear}=useCustomerCart();
 const boxSize="auto" as const;
 const [deliveryReview,setDeliveryReview]=useState<{
  cartKey:string;details:DeliveryDetails;
 }|null>(null);
 const cartKey=JSON.stringify(items);
 const confirmedDelivery=deliveryReview?.cartKey===cartKey?
  deliveryReview.details:null;
 const [enteredCode,setEnteredCode]=useState("");
 const [code,setCode]=useState("");
 const [codeError,setCodeError]=useState("");
 const [refreshRevision,setRefreshRevision]=useState(0);
 const [response,setResponse]=useState<{key:string;review:Review}|null>(null);
 const key=useMemo(()=>JSON.stringify({items,boxSize,code,refreshRevision}),[items,boxSize,code,refreshRevision]);
 const review=response?.key===key?response.review:null;
 // A restored tab, network reconnection and elapsed promotion/stock windows
 // invalidate old quotes. All fetches remain server-priced and nonpayable.
 useEffect(()=>{
  const refresh=()=>setRefreshRevision(current=>current+1);
  const visible=()=>{if(document.visibilityState==="visible")refresh();};
  window.addEventListener("focus",refresh);
  window.addEventListener("online",refresh);
  document.addEventListener("visibilitychange",visible);
  const interval=window.setInterval(visible,60_000);
  return ()=>{
   window.removeEventListener("focus",refresh);
   window.removeEventListener("online",refresh);
   document.removeEventListener("visibilitychange",visible);
   window.clearInterval(interval);
  };
 },[]);
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
  if(cleaned&&!/^[A-Z0-9_-]{3,24}$/.test(cleaned)){
   setCodeError("Enter a valid code (3–24 letters, numbers, dashes or underscores).");
   return;
  }
  setCodeError("");
  setCode(cleaned);
  setRefreshRevision(current=>current+1);
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
        <span>{verified?(verified.availability==="in_stock"?
         "Stock recorded — checkout unavailable":
         verified.availability==="insufficient_stock"?
         "Requested quantity exceeds available stock":"Sold out — cannot be ordered"):
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
     <DeliveryDetailsForm items={items} shippingMethod={selectedBox==="medium"?"medium":selectedBox==="small"?"small":null}
      onReviewed={details=>setDeliveryReview(details?{cartKey,details}:null)}/>
    </section>
    <aside className="apex-customer-summary" aria-label="Cart summary">
     <div className="apex-customer-summary-head">
      <h2>Order summary</h2>
      <button className="apex-customer-recheck" type="button"
       onClick={()=>setRefreshRevision(current=>current+1)}
       disabled={review===null} aria-label="Recheck saved prices and availability">
       Recheck prices &amp; stock
      </button>
     </div>
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
      {review?.ok&&review.freeShippingMinimumCents!=null?
       " Free shipping applies from "+usd(review.freeShippingMinimumCents)+" of merchandise after discounts where configured.":
       " Any free-shipping offer follows current saved store rules."}</p>
     <form onSubmit={applyCode} className="apex-customer-code">
      <label htmlFor="apex-cart-discount">Discount or free-shipping code</label>
      <div><input id="apex-cart-discount" maxLength={24} autoCapitalize="characters"
       autoCorrect="off" spellCheck={false} value={enteredCode}
       placeholder="Enter code" aria-invalid={Boolean(codeError)}
       aria-describedby={codeError?"apex-cart-code-error":undefined}
       onChange={e=>{setEnteredCode(e.target.value);setCodeError("");}}/>
       <button type="submit">Apply</button></div>
      {codeError&&<p id="apex-cart-code-error" role="alert" className="apex-cart-validation">{codeError}</p>}
      {code&&<button className="apex-customer-remove" type="button"
       onClick={()=>{setCode("");setEnteredCode("");setCodeError("");}}>Remove code</button>}
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
       <p className="apex-cart-validation">Checkout is not yet available. Inventory and prices must be rechecked before any future order.</p>
      </div>}
     <NonpayableOrderPanel enabled={nonpayableEnabled} signedIn={signedIn}
      items={items} code={code} delivery={confirmedDelivery}
      verifiedStock={Boolean(review?.ok&&items.length>0&&
       review.items?.length===items.length&&
       review.items.every(line=>line.availability==="in_stock")&&
       Number.isSafeInteger(review.totalCents)&&
       (review.totalCents??0)>0)}/>
     <button type="button" className="apex-customer-checkout" disabled>
      Checkout unavailable
     </button>
     <Link href="/catalog" className="apex-customer-return">Continue shopping</Link>
    </aside>
   </div>}
 </main>;
}
