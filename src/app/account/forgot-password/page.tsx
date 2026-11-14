import Link from "next/link";
import {ForgotPasswordForm} from "./form";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Forgot Password | Apex",robots:{index:false,follow:false}};

export default function ForgotPasswordPage(){
 return <main className="container supplier-shell">
  <Link href="/" className="back">← Apex home</Link>
  <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
   <p className="eyebrow">APEX / ACCOUNT SECURITY</p>
   <h1 style={{fontSize:"clamp(2rem,7vw,3rem)"}}>Forgot your password?</h1>
   <p className="notice">Enter the email for your Apex account. We’ll send a link to securely set a new password.</p>
   <ForgotPasswordForm/>
   <p className="notice"><Link href="/account/sign-in">Back to sign in</Link></p>
  </section>
 </main>;
}
