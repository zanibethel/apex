"use client";
import Link from "next/link";
import styles from "./password-visibility.module.css";
import {useActionState,useState} from "react";
import {registerCustomer,resendCustomerConfirmation}
 from "./actions";

type PasswordInputProps={
 id:string;
 name:"password"|"confirmPassword";
 label:string;
};

function PasswordInput({id,name,label}:PasswordInputProps){
 const [visible,setVisible]=useState(false);
 return <>
  <label htmlFor={id}>{label}</label>
  <div className={styles.field}>
   <input id={id} name={name} type={visible?"text":"password"}
    autoComplete="new-password" required minLength={12} maxLength={128}/>
   <button type="button" className={styles.toggle}
    aria-label={`${visible?"Hide":"Show"} ${label.toLowerCase()}`}
    title={`${visible?"Hide":"Show"} ${label.toLowerCase()}`}
    aria-pressed={visible} aria-controls={id}
    onClick={()=>setVisible(value=>!value)}>
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
     viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
     aria-hidden="true" focusable="false">
     {visible?<>
      <path d="M10.733 5.08A10.75 10.75 0 0 1 12 5c4.67 0 8.58 2.99 9.99 7.14"/>
      <path d="M6.61 6.61A10.7 10.7 0 0 0 2.01 11.34a1 1 0 0 0 0 .66C3.42 16.3 7.33 19 12 19c1.64 0 3.17-.37 4.52-1.03"/>
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
      <path d="M19.75 16.17a10.8 10.8 0 0 0 2.24-3.51"/>
      <path d="m2 2 20 20"/>
     </>:<>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
     </>}
    </svg>
   </button>
  </div>
 </>;
}

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
   <PasswordInput id="register-password" name="password" label="Password"/>
   <PasswordInput id="register-confirm" name="confirmPassword" label="Confirm password"/>
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
