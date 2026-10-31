"use client";
import { useActionState } from "react";
import { saveProfileDetails } from "./details-actions";
const inputs = [
  ["first_name","First name","given-name"],["last_name","Last name","family-name"],
  ["phone","Phone number","tel"],["address_line1","Street address","address-line1"],
  ["address_line2","Apartment, suite or unit","address-line2"],["city","City","address-level2"],
  ["state","State or region","address-level1"],["postal_code","ZIP or postal code","postal-code"]
] as const;
export function ProfileDetailsForm({ initial }: { initial: Record<string,string> }) {
  const [state, action, pending] = useActionState(saveProfileDetails, { ok:false, message:"" });
  return <section className="supplier-panel apex-profile-details">
    <h2>Contact & delivery details</h2>
    <p className="notice">All fields are optional while setting up your account. Delivery details will be requested when needed at checkout.</p>
    <form action={action} className="supplier-form">
      <div className="apex-profile-grid">{inputs.map(([name,label,autoComplete]) => <div key={name} className="apex-profile-field">
        <label htmlFor={name}>{label}</label>
        <input id={name} name={name} type={name==="phone"?"tel":"text"} autoComplete={autoComplete} defaultValue={initial[name] || ""} maxLength={name==="phone"?25:200} />
      </div>)}</div>
      <button className="button primary" type="submit" disabled={pending}>{pending?"Saving…":"Save profile"}</button>
      {state.message && <p role="status" className={state.ok?"notice":"supplier-error"}>{state.message}</p>}
    </form>
  </section>;
}
