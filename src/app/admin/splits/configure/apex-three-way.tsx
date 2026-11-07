"use client";
import {useActionState,useState} from "react";
import {saveMultiRecipientDraft} from "./actions";

type Recipient={id:string;display_name:string;recipient_type:string;status:string};
type Store={id:string;display_name:string};
const field={width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box" as const};
const label={display:"grid",gap:6,minWidth:0};
const PLATFORM_BPS=1000;
const SUPPLIER_POOL_BPS=9000;

export function ApexThreeWayDraft({
  enabled,recipients,stores,
}:{
  enabled:boolean;recipients:Recipient[];stores:Store[];
}) {
 const [state,action,pending]=useActionState(saveMultiRecipientDraft,{ok:false,message:""});
 const [storeId,setStoreId]=useState("");
 const [apexId,setApexId]=useState("");
 const [lilyId,setLilyId]=useState("");
 const [tierraId,setTierraId]=useState("");
 const [lilyBasisPoints,setLilyBasisPoints]=useState(4500);
 const tierraBasisPoints=SUPPLIER_POOL_BPS-lilyBasisPoints;
 const platformRecipients=recipients.filter(r=>r.status==="active"&&r.recipient_type==="platform");
 const supplierRecipients=recipients.filter(r=>r.status==="active"&&r.recipient_type==="supplier");
 const allocated=[apexId,lilyId,tierraId];
 const valid=!!storeId&&allocated.every(Boolean)&&new Set(allocated).size===3&&
   lilyBasisPoints>0&&lilyBasisPoints<SUPPLIER_POOL_BPS&&
   platformRecipients.some(r=>r.id===apexId)&&
   supplierRecipients.some(r=>r.id===lilyId)&&supplierRecipients.some(r=>r.id===tierraId);
 const rows=[
  {recipient_id:apexId,basis_points:PLATFORM_BPS},
  {recipient_id:lilyId,basis_points:lilyBasisPoints},
  {recipient_id:tierraId,basis_points:tierraBasisPoints},
 ];
 const choices=(type:"platform"|"supplier")=>(type==="platform"?platformRecipients:supplierRecipients).map(r=>
  <option key={r.id} value={r.id}>{r.display_name}</option>);
 const example=(bps:number)=>(bps/100).toFixed(2);

 return <section className="supplier-panel" style={{maxWidth:"100%",minWidth:0,marginTop:24,overflowWrap:"anywhere"}}>
  <p className="eyebrow">ONE BTCPAY STORE / THREE RECIPIENTS</p>
  <h2 style={{fontSize:"clamp(1.5rem, 6vw, 2rem)"}}>Apex · Lily · Tierra split</h2>
  <p className="notice">Default: 10% to Apex, 45% to Lily, 45% to Tierra. Adjust Lily's percentage; Tierra receives the remainder of the 90% supplier pool. This is a versioned proposal only, not a live Prism or wallet configuration.</p>
  <form action={action} className="supplier-form" style={{display:"grid",gap:16,minWidth:0}}>
   <input type="hidden" name="template" value="apex_shared_three_way_v1"/>
   <input type="hidden" name="scopeType" value="storefront"/>
   <input type="hidden" name="scopeId" value={storeId}/>
   <input type="hidden" name="recipients" value={JSON.stringify(rows)}/>
   <label style={label}>Apex storefront
    <select style={field} required value={storeId} onChange={e=>setStoreId(e.target.value)}>
     <option value="">Choose the Apex storefront</option>
     {stores.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}
    </select>
   </label>
   <label style={label}>Apex platform recipient — fixed 10%
    <select style={field} required value={apexId} onChange={e=>setApexId(e.target.value)}>
     <option value="">Choose your platform recipient</option>{choices("platform")}
    </select>
   </label>
   <label style={label}>Lily — supplier recipient
    <select style={field} required value={lilyId} onChange={e=>setLilyId(e.target.value)}>
     <option value="">Choose Lily's recipient record</option>{choices("supplier")}
    </select>
   </label>
   <label style={label}>Tierra — supplier recipient
    <select style={field} required value={tierraId} onChange={e=>setTierraId(e.target.value)}>
     <option value="">Choose Tierra's recipient record</option>{choices("supplier")}
    </select>
   </label>
   <label style={label}>Lily's share of the entire payment (0.01%–89.99%)
    <input style={field} type="range" min={1} max={8999} step={1}
     value={lilyBasisPoints} onChange={e=>setLilyBasisPoints(Number(e.target.value))}/>
   </label>
   <div className="apex-allocation-summary">
    <strong>100% planned</strong><span>Example $100 payment, before network fees</span>
   </div>
   <div className="apex-allocation-bar" role="img"
    aria-label={`Apex 10%, Lily ${example(lilyBasisPoints)}%, Tierra ${example(tierraBasisPoints)}%`}>
    <span style={{width:"10%",background:"#d97757"}}/>
    <span style={{width:`${lilyBasisPoints/100}%`,background:"#4688d8"}}/>
    <span style={{width:`${tierraBasisPoints/100}%`,background:"#18a58b"}}/>
   </div>
   <ul className="supplier-stores">
    <li><span>Apex — 10.00%</span><strong>$10.00</strong></li>
    <li><span>Lily — {example(lilyBasisPoints)}%</span><strong>${example(lilyBasisPoints)}</strong></li>
    <li><span>Tierra — {example(tierraBasisPoints)}%</span><strong>${example(tierraBasisPoints)}</strong></li>
   </ul>
   <p className="notice">Select the actual recipient records deliberately. Names in this template do not establish wallet ownership or transfer permissions. Each save creates a new draft version; existing order allocations are not changed.</p>
   {(!platformRecipients.length||supplierRecipients.length<2)&&
    <p className="notice">Create one active platform recipient and two active supplier recipients in the recipient directory before saving.</p>}
   <button className="button secondary" type="submit"
    disabled={!enabled||pending||!valid}>{pending?"Saving proposal…":"Save new three-way draft version"}</button>
   {!enabled&&<p className="notice">Draft saving remains disabled until the existing admin-write and database security gates are approved. The calculator remains available.</p>}
   {state.message&&<p role="status">{state.message}</p>}
  </form>
 </section>;
}
