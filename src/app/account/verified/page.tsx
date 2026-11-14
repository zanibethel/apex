import Link from "next/link";
import {createSupplierServerClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Email Confirmation | Apex",
 robots:{index:false,follow:false}};

export default async function CustomerVerifiedPage({searchParams}:{
 searchParams:Promise<{status?:string}>;
}){
 const {status}=await searchParams;
 const recognized=status==="confirmed"||status==="check";
 const client=recognized?await createSupplierServerClient():null;
 let signedInWithConfirmedEmail=false;
 try{
  if(client){
   const {data,error}=await client.auth.getUser();
   signedInWithConfirmedEmail=Boolean(!error&&data.user&&
    !data.user.is_anonymous&&data.user.email_confirmed_at);
  }
 }catch{}

 const heading=signedInWithConfirmedEmail?"Email confirmed":
  status==="confirmed"?"Confirmation accepted":
  status==="check"?"Check your account":"Unable to verify email";
 const detail=signedInWithConfirmedEmail?
  "Your Apex email is confirmed. You can open your customer profile. Ordering and payments remain unavailable.":
  status==="confirmed"?
  "Your verification link was accepted. If the email opened in a different browser, sign in with the password you created to continue.":
  status==="check"?
  "Supabase may already have confirmed your email before returning you to Apex. Sign in with the password you created to check your account. You do not need to register again.":
  "This confirmation link was invalid, expired, or could not be completed. You can request a new link from the registration page.";

 return <main className="container supplier-shell">
  <Link href="/" className="back">← Apex home</Link>
  <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
   <p className="eyebrow">APEX / EMAIL CONFIRMATION</p>
   <h1>{heading}</h1>
   <p role="status" className="notice">{detail}</p>
   <div className="actions">
    <Link className="button primary"
     href={signedInWithConfirmedEmail?"/account/profile":"/account/sign-in"}>
     {signedInWithConfirmedEmail?"Open my profile":"Account sign in"}
    </Link>
    {!recognized&&<Link className="button secondary"
      href="/account/sign-up">Request another confirmation email</Link>}
   </div>
  </section>
 </main>;
}
