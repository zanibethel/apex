import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 CUSTOMER_CONFIRM_URL_V1,isCustomerRegistrationEnabledV1,
 validateCustomerSignupV1,validEmailForResendV1,
 isApprovedCustomerPilotEmailV1
} from "../src/lib/auth/customer-registration-v1.mjs";
const read=(path)=>readFileSync(path,"utf8");
const flags={
 APEX_CUSTOMER_REGISTRATION_ENABLED:"true",
 APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL:"confirmed-email-flow-v1",
 APEX_CUSTOMER_REGISTRATION_TEST_EMAIL:"pilot@example.com",
};
test("customer signup is independently default off and not a checkout release",()=>{
 for(const v of [undefined,null,{},[],{APEX_CUSTOMER_REGISTRATION_ENABLED:"true"},
  {APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL:flags.APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL},
  {...flags,APEX_CUSTOMER_REGISTRATION_ENABLED:true},
  {...flags,APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL:"wrong"},
  {...flags,APEX_CUSTOMER_REGISTRATION_TEST_EMAIL:""},
  {...flags,APEX_CUSTOMER_REGISTRATION_TEST_EMAIL:"not-an-email"}])
  assert.equal(isCustomerRegistrationEnabledV1(v),false);
 assert.equal(isCustomerRegistrationEnabledV1(flags),true);
 assert.equal(CUSTOMER_CONFIRM_URL_V1,
  "https://apexanabolics.co/account/confirm");
});
test("server validation enforces matching 12+ password and bounded clean email",()=>{
 assert.deepEqual(validateCustomerSignupV1("  TEST@Example.Com  ","CorrectPassphrase123","CorrectPassphrase123"),
  {valid:true,email:"test@example.com"});
 for(const [email,password,confirmation] of [
  ["bad","CorrectPassphrase123","CorrectPassphrase123"],
  ["a".repeat(255)+"@example.com","CorrectPassphrase123","CorrectPassphrase123"],
  ["test@example.com","short","short"],
  ["test@example.com","ValidPassword123","not matching"],
  ["test@example.com","a".repeat(129),"a".repeat(129)],
  ["test@example.com","CorrectPassphrase123\n","CorrectPassphrase123\n"],
 ]){
  assert.equal(validateCustomerSignupV1(email,password,confirmation).valid,false);
 }
 assert.equal(validEmailForResendV1(" TEST@example.com "),"test@example.com");
 assert.equal(validEmailForResendV1("invalid"),null);
});
test("signup is server-only, uses Supabase client and fixed origin",()=>{
 const actions=read("src/app/account/sign-up/actions.ts");
 assert.match(actions,/^"use server";/);
 assert.match(actions,/isCustomerRegistrationEnabledV1\(process.env\)/);
 assert.match(actions,/client\.auth\.getUser\(\)/);
 assert.match(actions,/client\.auth\.signUp\(/);
 assert.match(actions,/client\.auth\.resend\(/);
 assert.match(actions,/emailRedirectTo:CUSTOMER_CONFIRM_URL_V1/);
 assert.match(actions,/if\(data\.session\)/);
 assert.doesNotMatch(actions,/service_role|admin\.createUser|\.insert\(|\.update\(|createInvoice|sendPayout|NEXT_PUBLIC_APP_MODE\s*===/);
});
test("email callback accepts hashed OTP and PKCE; no open redirect or secrets",()=>{
 const route=read("src/app/account/confirm/route.ts");
 assert.match(route,/verifyOtp\(\{type:"email",token_hash:tokenHash\}\)/);
 assert.match(route,/exchangeCodeForSession\(code!\)/);
 assert.match(route,/const BASE="https:\/\/apexanabolics\.co"/);
 assert.match(route,/getUser\(\)/);
 assert.match(route,/Referrer-Policy","no-referrer"/);
 assert.match(route,/Cache-Control","private, no-store"/);
 assert.match(route,/if\(\(tokenHash&&code\)/);
 assert.doesNotMatch(route,/params\.get\("next"\)|params\.get\("redirect"\)|request\.headers\.get\("host"\)|request\.nextUrl\.origin/);
});
test("signup page never invokes an Auth write while flags are OFF",()=>{
 const page=read("src/app/account/sign-up/page.tsx");
 const form=read("src/app/account/sign-up/form.tsx");
 assert.match(page,/isCustomerRegistrationEnabledV1\(process.env\)/);
 assert.match(page,/enabled\?<CustomerSignupForm\/>/);
 assert.match(form,/registerCustomer/);
 assert.match(form,/resendCustomerConfirmation/);
 assert.match(read("src/app/account/verified/page.tsx"),/client\.auth\.getUser\(\)/);
});
test("signup uses independent inline eye icons, never a separate submit control",()=>{
 const signup=read("src/app/account/sign-up/form.tsx");
 const css=read("src/app/account/sign-up/password-visibility.module.css");
 assert.match(signup,/useActionState,useState/);
 assert.match(signup,/function PasswordInput\(/);
 assert.match(signup,/const \[visible,setVisible\]=useState\(false\)/);
 assert.match(signup,/name=\{name\} type=\{visible\?"text":"password"\}/);
 assert.match(signup,/<PasswordInput id="register-password" name="password" label="Password"\/>/);
 assert.match(signup,/<PasswordInput id="register-confirm" name="confirmPassword" label="Confirm password"\/>/);
 assert.match(signup,/type="button" className=\{styles\.toggle\}/);
 assert.match(signup,/aria-pressed=\{visible\} aria-controls=\{id\}/);
 assert.match(signup,/aria-label=\{/);
 assert.match(signup,/onClick=\{\(\)=>setVisible\(value=>!value\)\}/);
 assert.match(signup,/<svg [\s\S]*aria-hidden="true"/);
 assert.match(signup,/type="submit" className="button primary"/);
 assert.doesNotMatch(signup,/showPasswords|setShowPasswords|Show passwords|Hide passwords/);
 assert.doesNotMatch(signup,/localStorage|sessionStorage|console\.log|fetch\(/);
 assert.match(css,/position:relative/);
 assert.match(css,/position:absolute/);
 assert.match(css,/padding-right:64px/);
 assert.match(css,/width:48px;height:48px/);
 assert.match(css,/:focus-visible/);
});
test("existing admin/supplier/customer login and order release gates untouched",()=>{
 const login=read("src/app/account/sign-in/actions.ts");
 assert.match(login,/isVerifiedPlatformAdmin\(data\.user\)/);
 assert.match(login,/supplier_memberships/);
 assert.match(login,/redirect\("\/account\/profile"\)/);
 const order=read("src/app/api/checkout/nonpayable/v1/route.ts");
 assert.match(order,/isRetailNonpayableSubmissionEnabledV1\(process.env\)/);
 assert.match(order,/isRetailProductionReviewApprovedV1\(process.env\)/);
});

test("only the single reviewed pilot address may use the customer signup and resend actions",()=>{
 assert.equal(isApprovedCustomerPilotEmailV1(flags,"PILOT@EXAMPLE.COM"),true);
 for(const v of ["wrong@example.com","pilot+alias@example.com","pilot@example.net","",null]){
  assert.equal(isApprovedCustomerPilotEmailV1(flags,v),false);
 }
 assert.equal(isApprovedCustomerPilotEmailV1({...flags,
  APEX_CUSTOMER_REGISTRATION_TEST_EMAIL:" Pilot@Example.Com "},"pilot@example.com"),true);
 assert.equal(isApprovedCustomerPilotEmailV1({},"pilot@example.com"),false);
 const actions=read("src/app/account/sign-up/actions.ts");
 const gateIndexes=[...actions.matchAll(/isApprovedCustomerPilotEmailV1\(process\.env,[^)]+\)/g)].map(v=>v.index);
 assert.equal(gateIndexes.length,2,"must guard both initial signup and resend");
 const signup=actions.indexOf("await client.auth.signUp(");
 const resend=actions.indexOf("await client.auth.resend(");
 assert.ok(gateIndexes[0]<signup&&gateIndexes[1]<resend);
 const cart=read("src/app/api/checkout/nonpayable/v1/route.ts");
 assert.doesNotMatch(cart,/APEX_CUSTOMER_REGISTRATION_TEST_EMAIL/);
});
