"use client";
import Link from "next/link";
import {useActionState} from "react";
import {registerCustomer,resendCustomerConfirmation}
 from "./actions";

export function CustomerSignupForm(){
 const [state,action,pending]=useActionState(registerCustomer,
  {ok:false,message:""});
 const [resendState,resendAction,resending]=useActionState(
  resendCustomerConfirmation,{ok:false,message:""});
 return <section className="supplier-panel" style={{maxWidth:560,marginInline:"auto"}}>
  <p className="eyebrow">APEX / CUSTOMER ACCOUNT</p>
  <h1 style={{fontSize:"clamp(2rem,7vw,3rem)"}}>Create your account</h1>
  <p className="notice">Create an Apex customer profile using your email.
   Confirm your email before signing in. Orders and payments remain unavailable.</p>
  {!state.ok&&<form action={action} className="supplier-form">
   <label htmlFor="register-email">Email</label>
   <input id="register-email" name="email" type="email" required
    maxLength={254} autoComplete="email"/>
   <label htmlFor="register-password">Password</label>
   <input id="register-password" name="password" type="password"
    autoComplete="new-password" required minLength={12} maxLength={128}/>
   <label htmlFor="register-confirm">Confirm password</label>
   <input id="register-confirm" name="confirmPassword" type="password"
    autoComplete="new-password" required minLength={12} maxLength={128}/>
   <button type="submit" className="button primary" disabled={pending}>
    {pending?"Creating account…":"Create account"}</button>
  </form>}
  {state.message&&<p role="status" className={state.ok?"notice":"supplier-error"}>
   {state.message}</p>}
  {state.ok&&<p className="notice">The confirmation link may be in your spam
   folder. If you already have an account, sign in instead.</p>}
  <p className="notice">Need another confirmation email? Enter the email
   address used when registering.</p>
  <form action={resendAction} className="supplier-form">
   <label htmlFor="resend-email">Account email</label>
   <input id="resend-email" type="email" name="email" autoComplete="email"
    maxLength={254} required/>
   <button type="submit" className="button secondary" disabled={resending}>
    {resending?"Requesting…":"Resend confirmation"}</button>
  </form>
  {resendState.message&&<p role="status"
   className={resendState.ok?"notice":"supplier-error"}>{resendState.message}</p>}
  <p className="notice"><Link href="/account/sign-in">Already registered? Sign in</Link></p>
 </section>;
}
