"use client";
import { useActionState, useState } from "react";
import { saveRecipient } from "./actions";
type Recipient = {id:string;display_name:string;recipient_type:string;status:string};
const field = { width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const };
const label = { display: "grid", gap: 6, minWidth: 0 };
export function RecipientForm({ recipient, enabled }: {recipient?:Recipient;enabled:boolean}) {
 const [state, action, pending]=useActionState(saveRecipient,{ok:false,message:""});
 const [recipientType, setRecipientType] = useState(recipient?.recipient_type ?? "platform");
 const [status, setStatus] = useState(recipient?.status ?? "inactive");
 return <form action={action} style={{display:"grid",gap:14,width:"100%",maxWidth:480,minWidth:0}}>
  <input type="hidden" name="id" value={recipient?.id ?? ""} />
  <label style={label}>Display name<input style={field} required name="displayName" maxLength={100} defaultValue={recipient?.display_name ?? ""} placeholder="Recipient name" /></label>
  <label style={label}>Recipient type<select style={field} name="recipientType" value={recipientType} onChange={e => setRecipientType(e.target.value)}><option value="platform">Platform</option><option value="supplier">Supplier</option><option value="partner">Partner</option><option value="other">Other</option></select></label>
  <label style={label}>Status<select style={field} name="status" value={status} onChange={e => setStatus(e.target.value)}><option value="inactive">Inactive</option><option value="active">Active</option></select></label>
  {!recipient && <p className="notice">Start with a Platform recipient and a Supplier recipient. Names are reporting labels only, not payment destinations.</p>}
  <p className="notice">{status === "active" ? "Active recipients can be selected in new draft allocations." : "Inactive recipients will not appear in new draft allocation selections."}</p>
  <button className="button secondary" disabled={!enabled || pending}>{pending?"Saving…":recipient?"Update recipient":"Add recipient"}</button>
  {!enabled && <p className="notice">Recipient editing is disabled in this preview.</p>}
  {state.message && <p role="status">{state.message}</p>}
 </form>;
}
