"use client";

import Link from "next/link";
import {useDemoCart} from "@/app/demo-cart";
import {useEffect,useRef,useState, type FormEvent} from "react";
import {
 DEMO_ITEMS,DEMO_SHIPPING,DEMO_RATE_CENTS,applyDemoCoupon,
 demoTotals,formatDemoUsd,formatDemoBtc,validateDemoGuest,
 normalizeDemoQuantity,
} from "@/lib/checkout/preview-model.mjs";
import {displayDemoState,filterDemoStates,resolveDemoState} from "@/lib/checkout/us-states.mjs";

type Step="details"|"bitcoin"|"complete";
type PaymentState="awaiting"|"detected"|"confirmed"|"expired";
type Guest={
 firstName:string;lastName:string;email:string;phone:string;
 street:string;city:string;state:string;postal:string;
};
type GuestKey=keyof Guest;

const INITIAL_GUEST:Guest={
 firstName:"Demo",lastName:"Customer",email:"demo@example.invalid",phone:"",
 street:"123 Example Way",city:"Sample City",state:"TX",postal:"00000",
};
const FIELDS: {name:GuestKey;label:string;type?:string;autoComplete?:string}[]=[
 {name:"firstName",label:"First name",autoComplete:"off"},
 {name:"lastName",label:"Last name",autoComplete:"off"},
 {name:"email",label:"Email address",type:"email",autoComplete:"off"},
 {name:"phone",label:"Phone (optional)",type:"tel",autoComplete:"off"},
 {name:"street",label:"Street address",autoComplete:"off"},
 {name:"city",label:"City",autoComplete:"off"},
 {name:"state",label:"State",autoComplete:"off"},
 {name:"postal",label:"ZIP code",autoComplete:"off"},
];

export function CheckoutPreview(){
 const [step,setStep]=useState<Step>("details");
 const [status,setStatus]=useState<PaymentState>("awaiting");
 const [guest,setGuest]=useState<Guest>(INITIAL_GUEST);
 const [errors,setErrors]=useState<Partial<Record<GuestKey,string>>>({});
 const cart=useDemoCart();
 const {quantities}=cart;
 const [shipping,setShipping]=useState<"standard"|"express">("standard");
 const [couponInput,setCouponInput]=useState("");
 const [coupon,setCoupon]=useState("");
 const [couponError,setCouponError]=useState("");
 const [statePickerOpen,setStatePickerOpen]=useState(false);
 const [stateSearch,setStateSearch]=useState("");
 const stateButtonRef=useRef<HTMLButtonElement>(null);
 const stateSearchRef=useRef<HTMLInputElement>(null);
 const stateChoices=filterDemoStates(stateSearch);
 useEffect(()=>{
  if(!statePickerOpen)return;
  const priorOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  stateSearchRef.current?.focus({preventScroll:true});
  const onEscape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){
    event.preventDefault();
    setStatePickerOpen(false);
    stateButtonRef.current?.focus({preventScroll:true});
   }
  };
  document.addEventListener("keydown",onEscape);
  return ()=>{
   document.removeEventListener("keydown",onEscape);
   document.body.style.overflow=priorOverflow;
  };
 },[statePickerOpen]);
 const total=demoTotals({quantities,shipping,coupon});
 const updateGuest=(key:GuestKey,value:string)=>{
  setGuest(current=>({...current,[key]:value}));
  setErrors(current=>({...current,[key]:undefined}));
 };
 const openStatePicker=()=>{
  setStateSearch("");
  setStatePickerOpen(true);
 };
 const closeStatePicker=()=>{
  setStatePickerOpen(false);
  stateButtonRef.current?.focus({preventScroll:true});
 };
 const chooseState=(code:string)=>{
  updateGuest("state",code);
  closeStatePicker();
 };
 const changeQuantity=(id:string,direction:number)=>{
  cart.setQuantity(id,normalizeDemoQuantity((quantities[id]??0)+direction));
 };
 const applyCoupon=()=>{
  const result=applyDemoCoupon(couponInput);
  setCoupon(result.accepted?result.code:"");
  setCouponError(result.error??"");
 };
 const proceed=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const nextErrors=validateDemoGuest(guest);
  setErrors(nextErrors);
  if(Object.keys(nextErrors).length||!total.items.length)return;
  setStatus("awaiting");
  setStep("bitcoin");
  window.scrollTo({top:0,behavior:"instant"});
 };
 const reset=()=>{
  setStep("details");
  setStatus("awaiting");
  setGuest(INITIAL_GUEST);
  setErrors({});
  cart.clear();
  setShipping("standard");
  setCoupon("");
  setCouponInput("");
  setCouponError("");
  setStatePickerOpen(false);
  setStateSearch("");
 };
 return <main className="container apex-checkout-preview">
  <div className="apex-checkout-live-test-banner" role="status" aria-label="Checkout simulation mode">
   <strong>TEST MODE — SIMULATED PAYMENTS ONLY</strong>
   <span>This public demo cannot accept Bitcoin, place orders, or trigger shipments. Do not send funds or enter real personal information.</span>
  </div>
  <div className="apex-checkout-topline">
   <Link href="/catalog" className="apex-checkout-back">← Back to catalog</Link>
   <span className="apex-checkout-safe">● SANDBOX EXPERIENCE · NO REAL PAYMENTS</span>
  </div>
  <div className="apex-checkout-head">
   <p className="eyebrow">APEX ANABOLICS / CHECKOUT DESIGN PREVIEW</p>
   <h1>THE FINAL <span>STEP.</span></h1>
   <p>Try a complete checkout journey with fictional products and sample guest details. Everything stays in your browser. No order, invoice, QR address, or payment is created.</p>
  </div>
  <ol className="apex-checkout-steps" aria-label="Checkout preview progress">
   {[["details","01","Information"],["bitcoin","02","Bitcoin"],["complete","03","Confirmation"]].map(([id,number,label])=>
    <li key={id} className={step===id?"is-active":(id==="details"&&step!=="details")||(id==="bitcoin"&&step==="complete")?"is-done":""}
      aria-current={step===id?"step":undefined}>
     <span className="apex-checkout-step-num">{number}</span>
     <span>{label}</span>
    </li>
   )}
  </ol>
  <div className="apex-checkout-layout">
   <section className="apex-checkout-workspace" aria-live="polite">
    {step==="details"&&<form onSubmit={proceed} noValidate>
      <div className="apex-checkout-section-top">
       <div>
        <p className="apex-checkout-kicker">01 / YOUR INFORMATION</p>
        <h2>Guest checkout</h2>
       </div>
       <span className="apex-checkout-mini">No account required</span>
      </div>
      <p className="apex-checkout-support">The form is prefilled with fictional data so you can test the flow immediately. Please do not enter real personal information.</p>
      {!total.items.length&&<div className="apex-checkout-empty-cart" role="status"><strong>Nothing in your demo cart yet.</strong><span>Pick a fictional sample item before continuing.</span><Link href="/catalog">Browse sample items →</Link></div>}
      <div className="apex-checkout-fields">
       {FIELDS.map(field=>field.name==="state"?
        <div className="apex-checkout-field apex-checkout-state" key="state">
         <span aria-hidden="true">State</span>
         <button ref={stateButtonRef} type="button"
          className="apex-state-trigger"
          aria-label={"Choose shipping region: "+displayDemoState(guest.state)}
          aria-haspopup="dialog" aria-expanded={statePickerOpen}
          aria-describedby={errors.state?"apex-error-state":undefined}
          onClick={openStatePicker}>
          <span>{displayDemoState(guest.state)}</span><span aria-hidden="true">⌄</span>
         </button>
         {errors.state&&<small id="apex-error-state" className="apex-checkout-error">{errors.state}</small>}
        </div>
        :<label className={"apex-checkout-field apex-checkout-"+field.name} key={field.name} htmlFor={"apex-preview-"+field.name}>
         <span>{field.label}</span>
         <input id={"apex-preview-"+field.name} type={field.type??"text"}
          value={guest[field.name]} autoComplete={field.autoComplete??"off"}
          onChange={event=>updateGuest(field.name,event.target.value)}
          aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name]?"apex-error-"+field.name:undefined}
          maxLength={field.name==="email"?160:field.name==="street"?140:75}/>
         {errors[field.name]&&<small id={"apex-error-"+field.name} className="apex-checkout-error">{errors[field.name]}</small>}
        </label>)}
       {statePickerOpen&&<div className="apex-state-layer">
        <button type="button" tabIndex={-1} className="apex-state-backdrop"
         aria-label="Close state picker" onClick={closeStatePicker}/>
        <section className="apex-state-dialog" role="dialog" aria-modal="true"
         aria-labelledby="apex-state-dialog-title" aria-describedby="apex-state-dialog-description">
         <div className="apex-state-dialog-header">
          <div>
           <p className="apex-checkout-kicker">SHIPPING INFORMATION</p>
           <h3 id="apex-state-dialog-title">Choose your state</h3>
          </div>
          <button type="button" className="apex-state-close" onClick={closeStatePicker}
           aria-label="Close state picker">✕</button>
         </div>
         <label className="apex-state-search-label" htmlFor="apex-state-search">Search by name or abbreviation</label>
         <input ref={stateSearchRef} className="apex-state-search" type="search"
          id="apex-state-search" value={stateSearch} placeholder="Type Texas or TX"
          autoComplete="off" maxLength={40}
          onChange={event=>setStateSearch(event.target.value)}
          onKeyDown={event=>{
           if(event.key==="Enter"){
            event.preventDefault();
            const match=resolveDemoState(stateSearch)??(stateChoices.length===1?stateChoices[0]:null);
            if(match)chooseState(match.code);
           }
          }}/>
         <p id="apex-state-dialog-description" className="apex-state-hint" role="status">
          {stateChoices.length} {stateChoices.length===1?"state":"states"} · scroll or type to filter
         </p>
         <div className="apex-state-options" role="listbox" aria-label="Available US states">
          {stateChoices.map(option=><button key={option.code} type="button"
           role="option" aria-selected={guest.state===option.code}
           onClick={()=>chooseState(option.code)}>
            <span>{option.name}</span><strong>{option.code}</strong>
           </button>)}
          {!stateChoices.length&&<p className="apex-state-empty">No matching states. Try a name or two-letter abbreviation.</p>}
         </div>
        </section>
       </div>}
      </div>
      <fieldset className="apex-checkout-shipping">
       <legend>Delivery method <span>· sample options</span></legend>
       {(Object.entries(DEMO_SHIPPING) as [typeof shipping,{label:string;detail:string;cents:number}][]).map(([id,option])=>
        <label className={"apex-checkout-ship"+(shipping===id?" is-selected":"")} key={id}>
         <input type="radio" name="apex-shipping-preview" checked={shipping===id}
          onChange={()=>setShipping(id)}/>
         <span><strong>{option.label}</strong><small>{option.detail}</small></span>
         <b>{formatDemoUsd(option.cents)}</b>
        </label>
       )}
      </fieldset>
      <p className="apex-checkout-privacy">Demo only · No shipping, account, notifications, or data submission takes place.</p>
      <button type="submit" className="apex-checkout-cta" disabled={!total.items.length}>
       Continue to Bitcoin preview <span aria-hidden="true">→</span>
      </button>
    </form>}
    {step==="bitcoin"&&<div>
      <div className="apex-checkout-section-top">
       <div><p className="apex-checkout-kicker">02 / PAYMENT</p><h2>Pay with Bitcoin</h2></div>
       <span className="apex-checkout-mini">Simulation</span>
      </div>
      <p className="apex-checkout-support">This is an interactive stand-in for the BTCPay invoice screen. It does not contact BTCPay, generate an address, or request a transfer.</p>
      <div className="apex-checkout-invoice">
       <div className="apex-checkout-invoice-head">
        <span className="apex-checkout-kicker">SIMULATED INVOICE</span>
        <strong className={"apex-checkout-state state-"+status}>{status==="awaiting"?"Awaiting payment":status==="detected"?"Payment detected":status==="confirmed"?"Payment confirmed":"Invoice expired"}</strong>
       </div>
       <div className="apex-checkout-payment-body">
        <div className="apex-checkout-not-qr" role="img" aria-label="Sample placeholder, not a scannable Bitcoin QR code">
         <span className="apex-checkout-qr-icon" aria-hidden="true">₿</span>
         <strong>QR PREVIEW</strong>
         <small>Not scannable</small>
        </div>
        <div className="apex-checkout-invoice-amount">
         <span>Fictional Bitcoin amount</span>
         <strong>{formatDemoBtc(total.mockSats)}</strong>
         <small>Based on a fixed sample conversion of {formatDemoUsd(DEMO_RATE_CENTS)} per BTC. This is not a live exchange rate or payment quote.</small>
         <div className="apex-checkout-address">
          <span>Destination address</span>
          <strong>Not generated in demo</strong>
         </div>
        </div>
       </div>
       <p className="apex-checkout-invoice-note">No wallet address, payment link, transaction, or real invoice exists. Use the controls below to test status messaging.</p>
      </div>
      <div className="apex-checkout-status-controls">
       <h3>Test payment states</h3>
       <p>These controls only change the demonstration on this page.</p>
       {status==="awaiting"&&<div className="apex-checkout-actions">
        <button className="apex-checkout-cta" type="button" onClick={()=>setStatus("detected")}>Simulate payment detected</button>
        <button className="apex-checkout-subtle" type="button" onClick={()=>setStatus("expired")}>Simulate expiry</button>
       </div>}
       {status==="detected"&&<div className="apex-checkout-actions">
        <button type="button" className="apex-checkout-cta" onClick={()=>setStatus("confirmed")}>Simulate blockchain confirmation</button>
        <button type="button" className="apex-checkout-subtle" onClick={()=>setStatus("expired")}>Simulate expiry</button>
       </div>}
       {status==="confirmed"&&<button type="button" className="apex-checkout-cta" onClick={()=>{setStep("complete");window.scrollTo({top:0,behavior:"instant"});}}>View confirmation screen →</button>}
       {status==="expired"&&<button type="button" className="apex-checkout-cta" onClick={()=>setStatus("awaiting")}>Restart simulated invoice</button>}
      </div>
      <button type="button" className="apex-checkout-back-button" onClick={()=>{setStep("details");setStatus("awaiting");}}>← Edit checkout details</button>
    </div>}
    {step==="complete"&&<div className="apex-checkout-confirmed">
      <div className="apex-checkout-confirm-icon" aria-hidden="true">✓</div>
      <p className="apex-checkout-kicker">03 / CONFIRMATION</p>
      <h2>Preview complete.</h2>
      <p>You reached the final screen. In a real purchase, a confirmed payment would be verified on the server before an order could be marked paid.</p>
      <div className="apex-checkout-confirm-details">
       <div><span>Reference</span><strong>DEMO-ONLY · NO ORDER</strong></div>
       <div><span>Sample customer</span><strong>{guest.firstName} {guest.lastName}</strong></div>
       <div><span>Simulated total</span><strong>{formatDemoUsd(total.totalCents)}</strong></div>
       <div><span>Payment</span><strong>Simulated confirmation</strong></div>
      </div>
      <div className="apex-checkout-actions">
       <button className="apex-checkout-cta" type="button" onClick={reset}>Start preview again</button>
       <Link className="apex-checkout-subtle" href="/catalog">Back to storefront</Link>
      </div>
      <p className="apex-checkout-privacy">No purchase, email, record, shipment, or blockchain event occurred.</p>
    </div>}
   </section>
   <aside className="apex-checkout-summary" aria-label="Simulated order summary">
    <div className="apex-checkout-summary-head">
      <span className="apex-checkout-kicker">DEMO BAG</span>
      <span>{total.items.reduce((n,item)=>n+item.quantity,0)} items</span>
    </div>
    <h2>Your order</h2>
    {DEMO_ITEMS.map(item=>{
      const qty=quantities[item.id]??0;
      return <div className="apex-checkout-item" key={item.id}>
       <div className="apex-checkout-product-art" aria-hidden="true">{item.id==="demo-shirt"?"A":"▲"}</div>
       <div className="apex-checkout-item-copy">
        <strong>{item.name}</strong>
        <span>{item.category}</span>
        {step==="details"?<div className="apex-checkout-qty" aria-label={"Quantity for "+item.name}>
          <button type="button" onClick={()=>changeQuantity(item.id,-1)} disabled={qty===0} aria-label={"Remove one "+item.name}>−</button>
          <output aria-label={"Quantity "+item.name}>{qty}</output>
          <button type="button" onClick={()=>changeQuantity(item.id,1)} disabled={qty===5} aria-label={"Add one "+item.name}>+</button>
        </div>:<span>Qty {qty}</span>}
       </div>
       <strong>{formatDemoUsd(item.unitCents*qty)}</strong>
      </div>;
    })}
    {step==="details"&&<div className="apex-checkout-coupon">
      <label htmlFor="apex-demo-coupon">Discount code</label>
      <div>
       <input id="apex-demo-coupon" value={couponInput} onChange={e=>{setCouponInput(e.target.value);setCouponError("");}}
        placeholder="Try DEMO10" maxLength={20}/>
       <button type="button" onClick={applyCoupon}>Apply</button>
      </div>
      {couponError&&<small role="status" className="apex-checkout-error">{couponError}</small>}
      {coupon&&<small role="status" className="apex-checkout-success">DEMO10 applied · 10% off sample subtotal <button type="button" onClick={()=>{setCoupon("");setCouponInput("");}}>Remove</button></small>}
    </div>}
    <dl className="apex-checkout-prices">
      <div><dt>Subtotal</dt><dd>{formatDemoUsd(total.subtotalCents)}</dd></div>
      {coupon&&<div className="apex-checkout-discount"><dt>Demo discount</dt><dd>−{formatDemoUsd(total.discountCents)}</dd></div>}
      <div><dt>Shipping</dt><dd>{formatDemoUsd(total.shippingCents)}</dd></div>
      <div><dt>Taxes</dt><dd>Not calculated</dd></div>
      <div className="apex-checkout-price-total"><dt>Illustrative total</dt><dd>{formatDemoUsd(total.totalCents)}</dd></div>
    </dl>
    {!total.items.length&&<p className="apex-checkout-error">Add at least one sample item to continue.</p>}
    <div className="apex-checkout-summary-foot">Fictional products and prices · No checkout, payment, or tax calculation is active.</div>
   </aside>
  </div>
 </main>;
}
