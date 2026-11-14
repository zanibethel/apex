import Link from "next/link";
import {CustomerSignupForm} from "./form";
import {signOutForCustomerRegistration} from "./actions";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isCustomerRegistrationEnabledV1}
 from "@/lib/auth/customer-registration-v1.mjs";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Create Account | Apex",robots:{index:false,follow:false}};

export default async function CustomerSignUpPage(){
 const enabled=isCustomerRegistrationEnabledV1(process.env);
 let alreadySignedIn=false;
 if(enabled){
  const client=await createSupplierServerClient();
  if(client){
   const {data,error}=await client.auth.getUser();
   alreadySignedIn=!error&&Boolean(data.user);
  }
 }
 return <main className="container supplier-shell">
  <Link className="back" href="/">← Apex home</Link>
  {enabled&&alreadySignedIn?
   <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
    <p className="eyebrow">APEX / CUSTOMER ACCOUNT</p>
    <h1>Switch accounts to register</h1>
    <p role="status" className="notice">You are already signed in to Apex.
     Sign out of that account before creating a separate test customer.
     This will not delete your existing account.</p>
    <form action={signOutForCustomerRegistration}>
     <button className="button secondary" type="submit">
      Sign out and create account
     </button>
    </form>
    <p className="notice">
     <Link href="/account/profile">Keep this session and open my profile</Link>
    </p>
   </section>:
   enabled?<CustomerSignupForm/>:
   <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
    <p className="eyebrow">APEX / CUSTOMER ACCOUNT</p>
    <h1>Create your account</h1>
    <p role="status" className="notice">Customer registration is being prepared.
     Existing customers, suppliers and admins can still sign in.</p>
    <Link className="button secondary" href="/account/sign-in">Account sign in</Link>
   </section>}
 </main>;
}
