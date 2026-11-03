"use client";

import Link from "next/link";
import Image from "next/image";
import {AdminCartValidationForm} from "./admin-cart-validation-form";
import {useMemo,useState,type FormEvent} from "react";

export type ReviewProduct={
 id:string;name:string;sku:string;description:string;category:string;
 priceCents:number;compareAtCents:number|null;imageUrl:string|null;
 available:number|null;active:boolean;
};
type Details={
 firstName:string;lastName:string;email:string;phone:string;
 street:string;city:string;state:string;postal:string;
};
const BLANK:Details={
 firstName:"",lastName:"",email:"",phone:"",street:"",
 city:"",state:"TX",postal:"",
};
const fields:ReadonlyArray<{key:keyof Details;label:string;type?:string;required?:boolean}>= [
 {key:"firstName",label:"First name",required:true},
 {key:"lastName",label:"Last name",required:true},
 {key:"email",label:"Email",type:"email",required:true},
 {key:"phone",label:"Phone (optional)",type:"tel"},
 {key:"street",label:"Shipping address",required:true},
 {key:"city",label:"City",required:true},
 {key:"state",label:"State",required:true},
 {key:"postal",label:"ZIP code",required:true},
];
const USD=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const money=(cents:number)=>USD.format(cents/100);
function reviewDetails(details:Details){
 const missing=(Object.keys(details) as (keyof Details)[]).filter(key=>
  key!=="phone"&&!details[key].trim());
 if(missing.length)return "Complete the required contact and shipping fields.";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim()))
  return "Enter a valid email format.";
 if(!/^[A-Za-z]{2}$/.test(details.state.trim()))
  return "Use a two-letter state code.";
 if(!/^\d{5}(-\d{4})?$/.test(details.postal.trim()))
  return "Enter a valid five-digit ZIP code.";
 return "";
}

export function CheckoutCatalogReview({products}:{products:ReviewProduct[]}){
 const [selectedId,setSelectedId]=useState(products[0]?.id??"");
 const [quantity,setQuantity]=useState(1);
 const [details,setDetails]=useState<Details>(BLANK);
 const [step,setStep]=useState<"details"|"payment">("details");
 const [message,setMessage]=useState("");
 const product=useMemo(()=>products.find(p=>p.id===selectedId)??null,[products,selectedId]);
 const subtotal=product?product.priceCents*quantity:0;
 const setField=(key:keyof Details,value:string)=>{
  setDetails(prev=>({...prev,[key]:value}));
  setMessage("");
 };
 const proceed=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const error=reviewDetails(details);
  setMessage(error);
  if(error||!product)return;
  // Browser-only transition. No contact details, inventory or payment request
  // leave this component; the zero-stock products remain unorderable.
  setStep("payment");
 };
 return <>
  <ol className="apex-checkout-steps" aria-label="Checkout steps">
   {[
    ["details","01","Information"],
    ["payment","02","Bitcoin"],
   ].map(([id,num,label])=><li key={id}
     className={step===id?"is-active":step==="payment"?"is-done":""}
     aria-current={step===id?"step":undefined}>
      <span className="apex-checkout-step-num">{num}</span><span>{label}</span>
    </li>)}
  </ol>
  <div className="apex-checkout-layout">
   <section className="apex-checkout-workspace" aria-live="polite">
    {step==="details"?<form onSubmit={proceed} noValidate>
     <div className="apex-checkout-section-top">
      <div><p className="apex-checkout-kicker">01 / CUSTOMER INFORMATION</p><h2>Guest checkout</h2></div>
      <span className="apex-checkout-mini">Design review</span>
     </div>
     <p className="apex-checkout-support">Review the form layout and validation.
      Entries remain in this browser session; nothing is submitted or saved.</p>
     <div className="apex-checkout-fields">
      {fields.map(field=><label key={field.key}
       className={"apex-checkout-field apex-checkout-"+field.key}>
       <span>{field.label}</span>
       <input type={field.type??"text"} value={details[field.key]}
        maxLength={field.key==="email"?160:field.key==="street"?140:75}
        autoComplete="off" required={field.required??false}
        onChange={event=>setField(field.key,event.target.value)}/>
      </label>)}
     </div>
     <div className="apex-checkout-shipping">
      <p className="apex-checkout-kicker">DELIVERY</p>
      <p className="apex-checkout-support">Shipping and taxes will be calculated
       by the production checkout service when configured.</p>
     </div>
     {message&&<p role="alert" className="apex-checkout-error">{message}</p>}
     <button type="submit" className="apex-checkout-cta" disabled={!product}>
      Review Bitcoin handoff <span aria-hidden="true">→</span>
     </button>
     <p className="apex-checkout-privacy">Private layout review. No order, wallet address,
      invoice, customer record, or payment is created.</p>
    </form>:
    <div>
     <div className="apex-checkout-section-top">
      <div><p className="apex-checkout-kicker">02 / BITCOIN</p><h2>Payment connection</h2></div>
      <span className="apex-checkout-mini">Not enabled</span>
     </div>
     <p className="apex-checkout-support">This is the intended payment handoff
      screen. The BTCPay connection is not enabled for customer transactions.</p>
     <div className="apex-checkout-invoice">
      <div className="apex-checkout-invoice-head">
       <span className="apex-checkout-kicker">PAYMENT METHOD</span>
       <strong className="apex-checkout-invoice-status state-expired">Awaiting setup</strong>
      </div>
      <div className="apex-checkout-review-handoff">
       <span className="apex-checkout-qr-icon" aria-hidden="true">₿</span>
       <div>
        <strong>Bitcoin through BTCPay Server</strong>
        <p>After activation, the server will create a signed, store-scoped
         invoice and return the genuine BTCPay checkout page.</p>
       </div>
      </div>
      <p className="apex-checkout-invoice-note">No invoice, scannable QR code,
       quoted BTC amount, or payment address is available until activation.</p>
     </div>
     <div className="apex-checkout-status-controls">
      <h3>Connection requirements</h3>
      <p>Store-scoped BTCPay credentials, configured live wallet and webhooks,
       reconciliation verification, and independent catalog release approval.</p>
      <button type="button" className="apex-checkout-cta" disabled>
       Payment unavailable
      </button>
     </div>
     <button type="button" className="apex-checkout-back-button"
      onClick={()=>setStep("details")}>← Edit customer details</button>
    </div>}
   </section>
   <aside className="apex-checkout-summary" aria-label="Saved catalog pricing review">
    <div className="apex-checkout-summary-head">
     <span className="apex-checkout-kicker">APEX CATALOG</span><span>{products.length} products</span>
    </div>
    <h2>Order summary</h2>
    <label className="apex-checkout-review-product-picker" htmlFor="checkout-review-product">
     <span>Product to review</span>
     <select id="checkout-review-product" value={selectedId}
      onChange={event=>{setSelectedId(event.target.value);setQuantity(1);setStep("details");setMessage("");}}>
      {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    {product&&<>
     <div className="apex-checkout-item">
      <div className="apex-checkout-product-art">
       {product.imageUrl?<Image src={product.imageUrl} width={58} height={61}
        alt="" unoptimized style={{width:"100%",height:"100%",objectFit:"contain"}}/>:"▲"}
      </div>
      <div className="apex-checkout-item-copy">
       <strong>{product.name}</strong><span>{product.category}</span>
       <span>SKU: {product.sku}</span>
       <span className="apex-checkout-review-soldout">Sold Out · 0 available</span>
       {step==="details"&&<div className="apex-checkout-qty">
        <button type="button" disabled={quantity===1}
         aria-label="Decrease preview quantity"
         onClick={()=>setQuantity(v=>Math.max(1,v-1))}>−</button>
        <output aria-label="Preview quantity">{quantity}</output>
        <button type="button" disabled={quantity===3}
         aria-label="Increase preview quantity"
         onClick={()=>setQuantity(v=>Math.min(3,v+1))}>+</button>
       </div>}
      </div>
      <strong>{money(product.priceCents*quantity)}</strong>
     </div>
     {product.compareAtCents!==null&&product.compareAtCents>product.priceCents&&
      <p className="apex-checkout-review-compare">
       Saved compare-at reference: {money(product.compareAtCents)}
      </p>}
     <p className="apex-checkout-review-description">{product.description}</p>
    </>}
    <dl className="apex-checkout-prices">
     <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
     <div><dt>Shipping</dt><dd>Pending configuration</dd></div>
     <div><dt>Taxes</dt><dd>Pending configuration</dd></div>
     <div className="apex-checkout-price-total"><dt>Displayed subtotal</dt><dd>{money(subtotal)}</dd></div>
    </dl>
    {product&&<AdminCartValidationForm key={product.id+":"+quantity}
     productId={product.id} quantity={quantity}/>}
    <p className="apex-checkout-summary-foot">This review uses saved Apex pricing,
     but stock is zero. Quantity changes affect only this screen and cannot
     reserve inventory or submit an order.</p>
    <Link href="/supplier/catalog/bulk" className="apex-checkout-back-button">
     Edit product details →
    </Link>
   </aside>
  </div>
 </>;
}
