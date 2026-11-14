import Link from "next/link";
import {createSupplierServerClient} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Email Confirmation | Apex",
 robots:{index:false,follow:false}};
export default async function CustomerVerifiedPage(){
 const client=await createSupplierServerClient();
 let confirmed=false;
 try{
  if(client){
   const {data,error}=await client.auth.getUser();
   confirmed=Boolean(!error&&data.user&&!data.user.is_anonymous&&
    data.user.email_confirmed_at);
  }
 }catch{}
 return <main className="container supplier-shell">
  <Link href="/" className="back">← Apex home</Link>
  <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
   <p className="eyebrow">APEX / EMAIL CONFIRMATION</p>
   <h1>{confirmed?"Email confirmed":"Unable to verify email"}</h1>
   {confirmed?
    <p role="status" className="notice">Your Apex email is verified. You can
     finish your customer profile. Checkout and payments are not yet available.</p>:
    <p role="alert" className="notice">This confirmation link was invalid,
     expired or could not be completed. Try signing in, or request a new link
     from the registration page.</p>}
   <div className="actions">
    <Link className="button primary"
     href={confirmed?"/account/profile":"/account/sign-in"}>
     {confirmed?"Open my profile":"Account sign in"}</Link>
    {!confirmed&&<Link className="button secondary"
      href="/account/sign-up">Create account / resend confirmation</Link>}
   </div>
  </section>
 </main>;
}
