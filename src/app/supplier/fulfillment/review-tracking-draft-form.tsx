"use client";

import {useActionState} from "react";
import {
 saveSupplierReviewTrackingDraft,
 type TrackingDraftActionState,
} from "./actions";

const INITIAL:TrackingDraftActionState={kind:"idle",message:""};

export function ReviewTrackingDraftForm({
 storeId,shipmentId,revision,requestId,
}:{
 storeId:string;shipmentId:string;revision:number;requestId:string;
}){
 const [state,action,pending]=useActionState(
  saveSupplierReviewTrackingDraft,INITIAL);
 const complete=state.kind==="saved"||state.kind==="replay";
 return <form className="supplier-form" action={action}
  style={{marginTop:14,maxWidth:520}}>
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="shipmentId" value={shipmentId}/>
  <input type="hidden" name="requestId" value={requestId}/>
  <input type="hidden" name="expectedRevision" value={revision}/>
  <p className="notice">Tracking draft only — no label, carrier
   confirmation or shipment-status change. Revision {revision}.</p>
  <label htmlFor={"review-carrier-"+shipmentId}>Carrier for draft</label>
  <select id={"review-carrier-"+shipmentId} name="carrier"
   defaultValue="USPS" disabled={pending||complete}>
   <option value="USPS">USPS</option>
   <option value="UPS">UPS</option>
   <option value="FEDEX">FedEx</option>
   <option value="DHL">DHL</option>
  </select>
  <label htmlFor={"review-tracking-"+shipmentId}>Tracking reference (draft)</label>
  <input id={"review-tracking-"+shipmentId}
   type="text" name="trackingReference" autoComplete="off"
   inputMode="text" minLength={8} maxLength={40}
   pattern="[A-Za-z0-9]{8,40}" required
   placeholder="Enter tracking reference"
   style={{textTransform:"uppercase"}}
   disabled={pending||complete}/>
  <button className="button secondary" type="submit"
   disabled={pending||complete}>{pending?"Checking revision…":
    complete?"Draft recorded":"Save tracking draft"}</button>
  {state.message&&<div role={complete?"status":"alert"}>
   <p>{state.message}</p>
   {(state.kind==="stale"||state.kind==="conflict")&&
    <p>Opened revision: {state.expectedRevision}
     {" · "}Current revision: {state.observedRevision}
     {state.latestCarrier&&state.latestTracking?
      <>{" · "}Latest draft: {state.latestCarrier} {state.latestTracking}</>:null}
    </p>}
  </div>}
 </form>;
}
