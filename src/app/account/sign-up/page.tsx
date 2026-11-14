import Link from "next/link";
import {CustomerSignupForm} from "./form";
import {isCustomerRegistrationEnabledV1}
 from "@/lib/auth/customer-registration-v1.mjs";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Create Account | Apex",robots:{index:false,follow:false}};
export default function CustomerSignUpPage(){
 const enabled=isCustomerRegistrationEnabledV1(process.env);
 return <main className="container supplier-shell">
  <Link className="back" href="/">← Apex home</Link>
  {enabled?<CustomerSignupForm/>:
   <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
    <p className="eyebrow">APEX / CUSTOMER ACCOUNT</p>
    <h1>Create your account</h1>
    <p role="status" className="notice">Customer registration is being prepared.
     Existing customers, suppliers and admins can still sign in.</p>
    <Link className="button secondary" href="/account/sign-in">Account sign in</Link>
   </section>}
 </main>;
}
