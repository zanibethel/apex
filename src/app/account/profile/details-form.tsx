"use client";
import { useActionState } from "react";
import type { AccountDetails } from "@/lib/account/profile-fields";
import { saveOwnDetails, type DetailsState } from "./details-actions";

type Props = { email: string; details: AccountDetails | null; available: boolean };
export function AccountDetailsForm({email,details,available}: Props) {
  const [state, action, pending] = useActionState(saveOwnDetails, {ok:false,message:""} as DetailsState);
  const inputs: {name:keyof AccountDetails;label:string;autoComplete?:string;max:number}[] = [
    {name:"first_name",label:"First name",autoComplete:"given-name",max:80},
    {name:"last_name",label:"Last name",autoComplete:"family-name",max:80},
    {name:"phone",label:"Phone number",autoComplete:"tel",max:30},
    {name:"address_line1",label:"Street address",autoComplete:"address-line1",max:180},
    {name:"address_line2",label:"Address line 2 / unit",autoComplete:"address-line2",max:180},
    {name:"city",label:"City",autoComplete:"address-level2",max:100},
    {name:"region",label:"State / province",autoComplete:"address-level1",max:100},
    {name:"postal_code",label:"ZIP / postal code",autoComplete:"postal-code",max:24},
    {name:"country_code",label:"Country (2 letters)",autoComplete:"country",max:2},
  ];
  return <section className="supplier-panel" style={{maxWidth: "none"}}>
    <h2>Contact details</h2>
    <p className="notice">These are private details for your own account, not public storefront information. Do not enter wallet seeds or payment credentials.</p>
    <p><strong>Account email:</strong> {email}</p>
    <p className="notice">Email changes require a separate verification flow and are not available here yet.</p>
    {!available ? <p role="status" className="supplier-error">The private profile database is not installed in this environment yet. Contact details are read-only until it is verified.</p> :
      <form action={action} className="supplier-form">
        <div className="apex-profile-grid">
          {inputs.map(input => <div key={input.name} className="apex-profile-field">
            <label htmlFor={"apex-"+input.name}>{input.label}</label>
            <input id={"apex-"+input.name} type={input.name==="phone"?"tel":"text"}
              name={input.name} maxLength={input.max} autoComplete={input.autoComplete}
              defaultValue={details?.[input.name] ?? (input.name==="country_code"?"US":"")} />
          </div>)}
        </div>
        <button className="button primary" type="submit" disabled={pending}>{pending?"Saving…":"Save contact details"}</button>
        {state.message && <p role="status" className={state.ok?"notice":"supplier-error"}>{state.message}</p>}
      </form>}
  </section>;
}
