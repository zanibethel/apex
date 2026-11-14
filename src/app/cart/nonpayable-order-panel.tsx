"use client";

import Link from "next/link";
import {useRef,useState,type FormEvent} from "react";

type Item={product_id:string;quantity:number};
type Delivery={
 firstName:string;lastName:string;email:string;phone:string;
 address1:string;address2:string;city:string;state:string;postalCode:string;
};
type Receipt={
 orderId:string;status:string;expiresAt:string;totalCents:number;
 currency:string;replayed:boolean;
};
type Result={key:string;receipt:Receipt|null;message:string};
type Props={
 enabled:boolean;signedIn:boolean;items:Item[];code:string;
 verifiedStock:boolean;delivery:Delivery|null;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const currency=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

export function NonpayableOrderPanel({
 enabled,signedIn,items,code,verifiedStock,delivery,
}:Props){
 const [consent,setConsent]=useState<{key:string;checked:boolean}|null>(null);
 const [submitting,setSubmitting]=useState(false);
 const [result,setResult]=useState<Result|null>(null);
 // No PII is persisted; this signature exists only in live React memory
 // and invalidates confirmations when cart or delivery details change.
 const key=JSON.stringify({items,code,delivery});
 const attempt=useRef<{key:string;requestId:string}|null>(null);
 const agreed=consent?.key===key&&consent.checked===true;
 const visible=result?.key===key?result:null;
 const receipt=visible?.receipt??null;
 const eligible=enabled&&signedIn&&verifiedStock&&delivery!==null&&
  items.length>0&&items.length<=8;
 const send=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!eligible||!agreed||submitting||receipt)return;
  const existing=attempt.current;
  const requestId=existing?.key===key?existing.requestId:crypto.randomUUID();
  attempt.current={key,requestId};
  setSubmitting(true);
  setResult(null);
  try{
   const response=await fetch("/api/checkout/nonpayable/v1",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     schemaVersion:1,requestId,
     cart:{items,code,boxSize:"auto"},delivery,
    }),
   });
   const data:unknown=await response.json();
   if(response.ok&&data&&typeof data==="object"&&
    "accepted" in data&&data.accepted===true&&
    "orderId" in data&&typeof data.orderId==="string"&&UUID.test(data.orderId)&&
    "status" in data&&data.status==="held_no_payment"&&
    "totalCents" in data&&Number.isSafeInteger(data.totalCents)&&
    "currency" in data&&data.currency==="USD"&&
    "expiresAt" in data&&typeof data.expiresAt==="string"&&
    "canPay" in data&&data.canPay===false&&
    "canShip" in data&&data.canShip===false&&
    "invoiceCreated" in data&&data.invoiceCreated===false&&
    "paymentConfirmed" in data&&data.paymentConfirmed===false){
    setResult({key,receipt:{
     orderId:data.orderId,status:data.status,
     expiresAt:data.expiresAt,totalCents:data.totalCents,
     currency:"USD",replayed:("replayed" in data&&data.replayed===true),
    },message:""});
    return;
   }
   const message=response.status===401?
    "Please sign in again with a verified account.":
    response.status===429?
    "Too many attempts. Wait ten minutes before trying again.":
    response.status===400?
    "Check the delivery details and selected products, then try again.":
    "Temporary nonpayable orders are not available. No purchase or payment was made.";
   setResult({key,receipt:null,message});
  }catch{
   // Network uncertainty: preserve the same idempotency UUID for retry.
   setResult({key,receipt:null,
    message:"Unable to verify the request. Retry with the same details; no payment was made."});
  }finally{
   setSubmitting(false);
  }
 };
 return <section className="apex-nonpayable-panel" aria-labelledby="nonpayable-heading">
  <h2 id="nonpayable-heading">Nonpayable order review</h2>
  {!enabled?<>
   <p className="apex-cart-note">Customer submissions are not open yet.
    This is a review-only checkout preview: no order, stock hold,
    invoice, payment or shipping request can be created.</p>
  </>:!signedIn?<>
   <p className="apex-cart-note">A confirmed customer account is required
    before temporary nonpayable order requests can be submitted.</p>
   <Link className="button secondary" href="/account/sign-in">Sign in to your account</Link>
  </>:receipt?<>
   <p role="status" className="apex-nonpayable-success">
    <strong>Temporary request recorded — not a purchase.</strong>
   </p>
   <dl className="apex-nonpayable-receipt">
    <div><dt>Order reference</dt><dd>{receipt.orderId}</dd></div>
    <div><dt>Estimated amount</dt><dd>{currency(receipt.totalCents)}</dd></div>
    <div><dt>Request expires</dt><dd>{
     Number.isFinite(Date.parse(receipt.expiresAt))?
      new Date(receipt.expiresAt).toLocaleString():"See order status"
    }</dd></div>
   </dl>
   <p className="apex-cart-note">No payment was taken. No shipment is authorized.
    This temporary nonpayable hold will expire automatically unless a
    separate, approved payment flow becomes available.</p>
  </>:<>
   <p className="apex-cart-note">Review current prices, availability and your
    delivery details first. Submitting requests a temporary inventory hold,
    <strong> not a purchase</strong>. No payment or shipment will occur.</p>
   {(!verifiedStock||items.length>8)&&
    <p className="apex-cart-validation">Current products and inventory must be
     verified, with no more than eight distinct products, before continuing.</p>}
   {!delivery&&<p className="apex-cart-note">Use “Review delivery details” above
    before submitting. Delivery information is not transmitted until you
    explicitly submit this request.</p>}
   <form onSubmit={send} className="apex-nonpayable-consent">
    <label>
     <input type="checkbox" checked={agreed}
      disabled={!eligible||submitting}
      onChange={event=>setConsent({key,checked:event.target.checked})}/>
     <span>I understand this is a temporary, nonpayable order hold,
      not a completed purchase, and I agree to submit my contact and
      shipping details for this request.</span>
    </label>
    <button type="submit" className="apex-customer-checkout"
     disabled={!eligible||!agreed||submitting}>
     {submitting?"Submitting secure request…":"Request temporary nonpayable hold"}
    </button>
   </form>
   {visible?.message&&<p role="alert" className="apex-cart-validation">
    {visible.message}</p>}
  </>}
 </section>;
}
