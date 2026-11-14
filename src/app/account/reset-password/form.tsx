"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import styles from "../sign-up/password-visibility.module.css";
import {completeAccountPasswordReset,type ResetPasswordState} from "./actions";

function PasswordField({id,name,label}:{
 id:string;name:"password"|"confirmPassword";label:string;
}){
 const [visible,setVisible]=useState(false);
 return <>
  <label htmlFor={id}>{label}</label>
  <div className={styles.field}>
   <input id={id} name={name} type={visible?"text":"password"}
    autoComplete="new-password" minLength={12} maxLength={128} required/>
   <button type="button" className={styles.toggle}
    aria-label={visible?"Hide password":"Show password"} title={visible?"Hide password":"Show password"}
    aria-pressed={visible} aria-controls={id}
    onClick={()=>setVisible(v=>!v)}>
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
     {visible?<><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M6 6C4 7.2 2.5 9.2 2 12c2 5 6 7 10 7 1.7 0 3.3-.4 4.7-1.1"/></>:<>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
     </>}
    </svg>
   </button>
  </div>
 </>;
}
export function ResetPasswordForm(){
 const [state,action,pending]=useActionState(completeAccountPasswordReset,
  {ok:false,message:""} as ResetPasswordState);
 return <>
  {!state.ok&&<form action={action} className="supplier-form">
   <PasswordField id="reset-password" name="password" label="New password"/>
   <PasswordField id="reset-confirm" name="confirmPassword" label="Confirm new password"/>
   <button className="button primary" type="submit" disabled={pending}>
    {pending?"Updating…":"Set new password"}</button>
  </form>}
  {state.message&&<p role="status" className={state.ok?"notice":"supplier-error"}>
   {state.message}</p>}
  {state.ok&&<Link className="button primary" href="/account/sign-in">Sign in</Link>}
  {!state.ok&&<p className="notice"><Link href="/account/forgot-password">Request a new link</Link></p>}
 </>;
}
