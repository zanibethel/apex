"use server";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {CUSTOMER_CONFIRM_URL_V1,isCustomerRegistrationEnabledV1,
 validateCustomerSignupV1,validEmailForResendV1}
 from "@/lib/auth/customer-registration-v1.mjs";

export type CustomerSignupState={ok:boolean;message:string};
const unavailable="Customer registration is not available yet.";
const received="If this email is eligible, please check your inbox for an Apex confirmation link.";
const retry="Unable to process that request now. Try again later.";

export async function registerCustomer(
 _previous:CustomerSignupState,form:FormData,
):Promise<CustomerSignupState>{
 if(!isCustomerRegistrationEnabledV1(process.env))
  return {ok:false,message:unavailable};
 const checked=validateCustomerSignupV1(
  form.get("email"),form.get("password"),form.get("confirmPassword"));
 if(!checked.valid||!checked.email)
  return {ok:false,message:checked.message??"Check your email and password."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:unavailable};
 try{
  // Existing verified supplier/admin sessions must not be replaced by a
  // signup action. Supabase alone controls identities and privileged roles.
  const current=await client.auth.getUser();
  if(!current.error&&current.data.user)
   return {ok:false,message:"Already signed in. Open your profile instead."};
  const {data,error}=await client.auth.signUp({
   email:checked.email,password:form.get("password") as string,
   options:{emailRedirectTo:CUSTOMER_CONFIRM_URL_V1},
  });
  if(error)return {ok:false,message:retry};
  // If hosted Confirm Email was accidentally disabled, stop rather than
  // presenting an immediately authenticated account as verified onboarding.
  if(data.session){
   await client.auth.signOut();
   return {ok:false,message:"Email confirmation needs to be enabled before registration can open."};
  }
  // Do not disclose if an account exists for the supplied email.
  return {ok:true,message:received};
 }catch{
  return {ok:false,message:retry};
 }
}

export async function resendCustomerConfirmation(
 _previous:CustomerSignupState,form:FormData,
):Promise<CustomerSignupState>{
 if(!isCustomerRegistrationEnabledV1(process.env))
  return {ok:false,message:unavailable};
 const email=validEmailForResendV1(form.get("email"));
 if(!email)return {ok:false,message:"Enter a valid email address."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:unavailable};
 try{
  // Supabase enforces its authentication email resend throttles. Never
  // reveal whether an account exists or which addresses were sent to.
  await client.auth.resend({
   type:"signup",email,options:{emailRedirectTo:CUSTOMER_CONFIRM_URL_V1},
  });
 }catch{
  // Account existence and provider responses are never exposed to a caller.
 }
 return {ok:true,message:received};
}
