/**
 * Separate, default-OFF customer registration release. Customer accounts
 * grant no supplier/admin role, inventory hold or checkout capability.
 * Operator flags must be enabled only after hosted Auth email/redirect tests.
 */
export const CUSTOMER_CONFIRM_ORIGIN_V1="https://apexanabolics.co";
export const CUSTOMER_CONFIRM_URL_V1=CUSTOMER_CONFIRM_ORIGIN_V1+"/account/confirm";
export function isCustomerRegistrationEnabledV1(env){
 return Boolean(env&&typeof env==="object"&&!Array.isArray(env)&&
  env.APEX_CUSTOMER_REGISTRATION_ENABLED==="true"&&
  env.APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL==="confirmed-email-flow-v1"&&
  typeof env.APEX_CUSTOMER_REGISTRATION_TEST_EMAIL==="string"&&
  validEmailForResendV1(env.APEX_CUSTOMER_REGISTRATION_TEST_EMAIL)!==null);
}
const CONTROL=/[\u0000-\u001f\u007f]/;
export function validateCustomerSignupV1(email,password,confirmation){
 if(typeof email!=="string"||typeof password!=="string"||
    typeof confirmation!=="string")return {valid:false,message:"Check your email and password."};
 const normalized=email.trim().toLowerCase();
 if(normalized.length<6||normalized.length>254||CONTROL.test(normalized)||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized))
  return {valid:false,message:"Enter a valid email address."};
 if(password.length<12||password.length>128||
    CONTROL.test(password)||password!==confirmation)
  return {valid:false,message:"Use a matching password of 12–128 characters."};
 return {valid:true,email:normalized};
}
export function validEmailForResendV1(value){
 if(typeof value!=="string")return null;
 const email=value.trim().toLowerCase();
 return email.length>=6&&email.length<=254&&!CONTROL.test(email)&&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:null;
}

/** Fail-closed, single-address pilot at the Apex server action layer.
 * Supabase Auth public API may independently accept signups when its global
 * Allow Signups switch is ON: this is NOT a provider-wide allowlist.
 */
export function isApprovedCustomerPilotEmailV1(env,email){
 return isCustomerRegistrationEnabledV1(env)&&
  validEmailForResendV1(email)!==null&&
  validEmailForResendV1(email)===
   validEmailForResendV1(env.APEX_CUSTOMER_REGISTRATION_TEST_EMAIL);
}
