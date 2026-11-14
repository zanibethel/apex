"use server";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {APEX_RECOVERY_URL,validRecoveryEmail} from "@/lib/auth/password-recovery-v1.mjs";

export type ForgotPasswordState={ok:boolean;message:string};
const received="If an Apex account uses that email, a password-reset link will arrive shortly. Check spam if needed.";

export async function requestAccountPasswordReset(
 _previous:ForgotPasswordState,form:FormData,
):Promise<ForgotPasswordState>{
 const email=validRecoveryEmail(form.get("email"));
 if(!email)return {ok:false,message:"Enter a valid email address."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Password recovery is temporarily unavailable."};
 try{
  // Never reveal account existence, email provider errors, or rate-limit details.
  // Supabase enforces Auth OTP rate limits. Do not introduce an admin API key.
  await client.auth.resetPasswordForEmail(email,{redirectTo:APEX_RECOVERY_URL});
 }catch{
  // Same response, even for unknown accounts or provider errors.
 }
 return {ok:true,message:received};
}
