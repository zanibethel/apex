"use client";

import {useState} from "react";
import styles from "@/app/account/sign-up/password-visibility.module.css";

type SignInPasswordFieldProps={
 id:string;
};

/**
 * Existing Apex eye control reused by all three sign-in forms.
 * The visibility toggle never submits the form or changes authentication.
 */
export function SignInPasswordField({id}:SignInPasswordFieldProps){
 const [visible,setVisible]=useState(false);
 return <>
  <label htmlFor={id}>Password</label>
  <div className={styles.field}>
   <input id={id} name="password" type={visible?"text":"password"}
    autoComplete="current-password" maxLength={4096} required/>
   <button type="button" className={styles.toggle}
    aria-label={visible?"Hide password":"Show password"}
    title={visible?"Hide password":"Show password"}
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
      <path d="M2 12s3.6-7 10-7 10 7-3.6 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
     </>}
    </svg>
   </button>
  </div>
 </>;
}
