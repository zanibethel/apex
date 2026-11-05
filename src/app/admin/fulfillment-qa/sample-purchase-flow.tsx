"use client";
import {useState} from "react";

type Stage={
 name:string;status:"passed"|"test_only"|"held";detail:string;
};
type Sample={
 schemaVersion:number;mode:string;headline:string;
 summary:{items:number;units:number;merchandiseCents:number;
  shippingCents:number;totalCents:number;currency:string};
 stages:readonly Stage[];
 liveCheckoutEnabled:boolean;realPaymentSettled:boolean;
 supplierShipmentAuthorized:boolean;postagePurchased:boolean;
 orderCreatedInDatabase:boolean;emailSent:boolean;
 simulatedProviderEventVerified:boolean;
 testResult:string;
};

export default function SamplePurchaseFlow({result}:{result:Sample}){
 const [ran,setRan]=useState(false);
 const safe=result.schemaVersion===1&&
  result.mode==="local_synthetic_only"&&
  result.testResult==="passed_without_live_transactions"&&
  result.stages.length===6&&
  !result.liveCheckoutEnabled&&!result.realPaymentSettled&&
  !result.supplierShipmentAuthorized&&!result.postagePurchased&&
  !result.orderCreatedInDatabase&&!result.emailSent&&
  result.simulatedProviderEventVerified===true;
 return <section className="supplier-panel" style={{maxWidth:"none",marginTop:18}}
  aria-labelledby="sample-purchase-title">
  <p className="eyebrow">START HERE · ONE-CLICK TEST</p>
  <h2 id="sample-purchase-title">Try one sample purchase</h2>
  <p>Checks the customer cart, checkout handoff, held order record,
   mock payment notification, supplier fulfillment rules and report
   preparation together. This is an in-memory engineering test;
   no real items, money, customer details or postage are involved.</p>
  {!safe?<p role="alert">Sample purchase test is unavailable.
    No live transaction will be attempted.</p>:
   <button className="button primary" type="button"
    onClick={()=>setRan(true)}
    style={{minHeight:46,fontWeight:700}}>
    {ran?"Run sample purchase again":"Run sample purchase"}
   </button>}
  {ran&&safe&&<div role="status" aria-live="polite"
   style={{marginTop:20}}>
   <p style={{fontWeight:700}}>
    <span aria-hidden="true">✓ </span>
    Sample workflow checks passed — no real purchase was made.
   </p>
   <p className="notice"><strong>Sample total:</strong> $63.00
    {" "}($55.00 items + $8.00 shipping).
    This was calculated from synthetic catalog prices.</p>
   <ol style={{paddingLeft:24,display:"grid",gap:14}}>
    {result.stages.map((step,i)=><li key={step.name}
     style={{padding:"12px 8px"}}>
     <strong>{step.name}</strong>
     <span style={{marginLeft:8,fontSize:12,opacity:.82}}>
      {step.status==="passed"?"Validated":
       step.status==="test_only"?"Mock event only":"Safely blocked"}
     </span>
     <p style={{margin:"6px 0 0"}}>{step.detail}</p>
    </li>)}
   </ol>
   <p className="notice"><strong>What this proves:</strong> the existing
    track contracts can process a sample through validation, detect
    tampering and preserve fulfillment/reporting boundaries.</p>
   <p className="notice"><strong>What it does not prove:</strong> a real
    checkout, independent Bitcoin settlement, USPS account access,
    shipping label purchase or completed customer delivery.
    Those integrations remain disabled until verified.</p>
  </div>}
 </section>;
}
