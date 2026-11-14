import Link from "next/link";
import {cookies} from "next/headers";
import {ResetPasswordForm} from "./form";
import {APEX_RECOVERY_COOKIE,validRecoveryToken} from "@/lib/auth/password-recovery-v1.mjs";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Reset Password | Apex",robots:{index:false,follow:false}};

export default async function ResetPasswordPage({searchParams}:{
 searchParams:Promise<{status?:string}>;
}){
 const cookieStore=await cookies();
 const {status}=await searchParams;
 const authorized=validRecoveryToken(cookieStore.get(APEX_RECOVERY_COOKIE)?.value)&&status!=="invalid";
 return <main className="container supplier-shell">
  <Link href="/" className="back">← Apex home</Link>
  <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
   <p className="eyebrow">APEX / ACCOUNT SECURITY</p>
   <h1 style={{fontSize:"clamp(2rem,7vw,3rem)"}}>Reset your password</h1>
   {authorized?<>
    <p className="notice">Choose a new password for the account associated with your recovery email. The link works even if you opened it in another browser.</p>
    <ResetPasswordForm/>
   </>:<>
    <p role="alert" className="notice">This password-reset link is missing, expired, or invalid. Request a new link to continue.</p>
    <Link className="button primary" href="/account/forgot-password">Request another link</Link>
   </>}
  </section>
 </main>;
}
