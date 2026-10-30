"use client";
import { useActionState } from "react";
import { saveRecipient } from "./actions";
type Recipient = {id:string;display_name:string;recipient_type:string;status:string};
export function RecipientForm({ recipient, enabled }: {recipient?:Recipient;enabled:boolean}) {
 const [state, action, pending]=useActionState(saveRecipient,{ok:false,message:""});
 return <form action={action} style={{display:"grid",gap:10,maxWidth:480}}>
  <input type="hidden" name="id" value={recipient?.id ?? ""} />
  <label>Display name<br /><input required name="displayName" maxLength={100} defaultValue={recipient?.display_name ?? ""} placeholder="Recipient name" /></label>
  <label>Recipient type<br /><select name="recipientType" defaultValue={recipient?.recipient_type ?? "partner"}><option value="platform">Platform</option><option value="supplier">Supplier</option><option value="partner">Partner</option><option value="other">Other</option></select></label>
  <label>Status<br /><select name="status" defaultValue={recipient?.status ?? "inactive"}><option value="inactive">Inactive</option><option value="active">Active</option></select></label>
  <button className="button secondary" disabled={!enabled || pending}>{pending?"Saving…":recipient?"Update recipient":"Add recipient"}</button>
  {state.message && <p role="status">{state.message}</p>}
 </form>;
}
