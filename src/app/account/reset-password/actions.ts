"use server";
import {cookies} from "next/headers";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {APEX_RECOVERY_COOKIE,validRecoveryToken,
 validateRecoveryPassword} from "@/lib/auth/password-recovery-v1.mjs";

export type ResetPasswordState={ok:boolean;message:string};
const invalid="This recovery link is invalid, expired, or already used. Request another link.";

export async function completeAccountPasswordReset(
 _previous:ResetPasswordState,form:FormData,
):Promise<ResetPasswordState>{
 const next=form.get("password");
 const confirmation=form.get("confirmPassword");
 const checked=validateRecoveryPassword(next,confirmation);
 if(!checked.valid)return {ok:false,message:checked.message!};
 const cookieStore=await cookies();
 const hash=cookieStore.get(APEX_RECOVERY_COOKIE)?.value;
 if(!validRecoveryToken(hash))return {ok:false,message:invalid};
 // Consume the browser's reset intent on first POST, including failed attempts.
 // A one-time Supabase recovery credential is required; a normal session
 // alone can never authorize a forgotten-password change.
 cookieStore.delete(APEX_RECOVERY_COOKIE);
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Password recovery is temporarily unavailable."};
 try{
  const {data,error}=await client.auth.verifyOtp({type:"recovery",token_hash:hash!});
  if(error||!data.session||!data.user||data.user.is_anonymous||!data.user.email_confirmed_at)
   return {ok:false,message:invalid};
  const {data:identity,error:identityError}=await client.auth.getUser();
  if(identityError||identity.user?.id!==data.user.id)
   return {ok:false,message:invalid};
  const {error:changeError}=await client.auth.updateUser({password:next as string});
  if(changeError)return {ok:false,message:"Password not changed. Request a new recovery link or contact support."};
  const {error:signoutError}=await client.auth.signOut({scope:"global"});
  return {ok:true,message:signoutError?
   "Password updated. Sign out of Apex on any other devices and sign in again.":
   "Password updated. Sign in again using your new password."};
 }catch{return {ok:false,message:invalid};}
}
