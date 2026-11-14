"use client";
import {useActionState} from "react";
import {requestAccountPasswordReset,type ForgotPasswordState} from "./actions";

export function ForgotPasswordForm(){
 const [state,action,pending]=useActionState(requestAccountPasswordReset,
  {ok:false,message:""} as ForgotPasswordState);
 return <>
  {!state.ok&&<form action={action} className="supplier-form">
   <label htmlFor="recovery-email">Account email</label>
   <input id="recovery-email" name="email" type="email"
    autoComplete="email" maxLength={254} required/>
   <button className="button primary" type="submit" disabled={pending}>
    {pending?"Requesting…":"Send password reset link"}</button>
  </form>}
  {state.message&&<p role="status" className={state.ok?"notice":"supplier-error"}>
   {state.message}</p>}
 </>;
}
