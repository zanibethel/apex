// Shared strict input validation for Apex's public password-recovery flow.
// This flow is independent of the customer-registration and commerce gates.
export const APEX_RECOVERY_URL="https://apexanabolics.co/account/reset-password/confirm";
export const APEX_RECOVERY_COOKIE="__Host-apex-recovery";
const CONTROL=/[\u0000-\u001f\u007f]/;
export function validRecoveryEmail(value){
 if(typeof value!=="string")return null;
 const email=value.trim().toLowerCase();
 return email.length>=6&&email.length<=254&&!CONTROL.test(email)&&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:null;
}
export function validRecoveryToken(value){
 return typeof value==="string"&&/^[A-Za-z0-9_-]{16,512}$/.test(value);
}
export function validateRecoveryPassword(next,confirmation){
 if(typeof next!=="string"||typeof confirmation!=="string"||
  next.length<12||next.length>128||CONTROL.test(next)||next!==confirmation)
  return {valid:false,message:"Use matching passwords of 12–128 characters."};
 return {valid:true};
}
