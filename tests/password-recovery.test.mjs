import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 APEX_RECOVERY_URL,APEX_RECOVERY_COOKIE,
 validRecoveryEmail,validRecoveryToken,validateRecoveryPassword
} from "../src/lib/auth/password-recovery-v1.mjs";
const read=(p)=>readFileSync(p,"utf8");
test("password recovery validates bounded email, token and password inputs",()=>{
 assert.equal(validRecoveryEmail(" USER@Example.com "),"user@example.com");
 for(const value of [null,"","wrong","x@example.com\n","x".repeat(255)+"@mail.com"])
  assert.equal(validRecoveryEmail(value),null);
 assert.equal(validRecoveryToken("a".repeat(16)),true);
 for(const value of ["","a".repeat(15),"b".repeat(513),"has spaces","a.b.c"])
  assert.equal(validRecoveryToken(value),false);
 assert.equal(validateRecoveryPassword("CorrectPassword123","CorrectPassword123").valid,true);
 for(const [a,b] of [["short","short"],["CorrectPassword123","DifferentPassword123"],["a".repeat(129),"a".repeat(129)],["line\nbreakpassword","line\nbreakpassword"],[null,null]])
  assert.equal(validateRecoveryPassword(a,b).valid,false);
 assert.equal(APEX_RECOVERY_URL,"https://apexanabolics.co/account/reset-password/confirm");
 assert.equal(APEX_RECOVERY_COOKIE,"__Host-apex-recovery");
});
test("login pages surface recovery independently of single-email signup pilot",()=>{
 const account=read("src/app/account/sign-in/page.tsx");
 const supplier=read("src/app/supplier/sign-in/page.tsx");
 const profile=read("src/app/account/profile/form.tsx");
 for(const s of [account,supplier,profile])
  assert.match(s,/href="\/account\/forgot-password"/);
 const forgot=read("src/app/account/forgot-password/actions.ts");
 assert.match(forgot,/^"use server";/);
 assert.match(forgot,/client\.auth\.resetPasswordForEmail\(email,\{redirectTo:APEX_RECOVERY_URL\}\)/);
 assert.doesNotMatch(forgot,/APEX_CUSTOMER_REGISTRATION_|supplier_memberships|admin\.createUser|service_role|checkout|console\.|getUser\(/);
 const page=read("src/app/account/forgot-password/form.tsx");
 assert.match(page,/useActionState\(requestAccountPasswordReset/);
 assert.match(page,/type="email"/);
 assert.doesNotMatch(page,/fetch\(|supabase\.auth|service_role/);
});
test("recovery GET never consumes tokens and strips sensitive query from destination",()=>{
 const route=read("src/app/account/reset-password/confirm/route.ts");
 assert.match(route,/p\.get\("type"\)!=="recovery"/);
 assert.match(route,/validRecoveryToken\(hash\)/);
 assert.match(route,/response\.cookies\.set\(APEX_RECOVERY_COOKIE,token/);
 assert.match(route,/httpOnly:true,secure:true,sameSite:"lax",path:"\/",maxAge:900/);
 assert.match(route,/Cache-Control","private, no-store"/);
 assert.match(route,/Referrer-Policy","no-referrer"/);
 assert.match(route,/status:303/);
 assert.doesNotMatch(route,/verifyOtp|updateUser|exchangeCodeForSession|request\.headers\.get\("host"\)|request\.nextUrl\.origin|params\.get\("next"\)/);
});
test("reset action requires consumed one-time recovery OTP and a server-verified user",()=>{
 const action=read("src/app/account/reset-password/actions.ts");
 const page=read("src/app/account/reset-password/page.tsx");
 const form=read("src/app/account/reset-password/form.tsx");
 assert.match(action,/validateRecoveryPassword\(next,confirmation\)/);
 assert.match(action,/validRecoveryToken\(hash\)/);
 assert.match(action,/cookieStore\.delete\(APEX_RECOVERY_COOKIE\)/);
 assert.match(action,/verifyOtp\(\{type:"recovery",token_hash:hash!\}\)/);
 assert.match(action,/client\.auth\.getUser\(\)/);
 assert.match(action,/identity\.user\?\.id!==data\.user\.id/);
 assert.match(action,/client\.auth\.updateUser\(\{password:next as string\}\)/);
 assert.match(action,/client\.auth\.signOut\(\{scope:"global"\}\)/);
 assert.match(page,/cookieStore\.get\(APEX_RECOVERY_COOKIE\)/);
 assert.match(form,/useActionState\(completeAccountPasswordReset/);
 assert.match(form,/styles\.toggle/);
 assert.doesNotMatch(action,/admin\.|supplier_memberships|\.rpc\(|\.from\(|service_role|checkout|app_metadata|user_metadata/);
});
test("branded recovery email uses direct token hash and preserves Supabase settings",()=>{
 const html=read("docs/email/apex-reset-password.html");
 assert.match(html,/Reset your password/);
 assert.match(html,/https:\/\/apexanabolics\.co\/apex-logo\.png\?v=20261114-clean/);
 assert.match(html,/account\/reset-password\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
 assert.match(html,/Reset my password/);
 assert.doesNotMatch(html,/\{\{ \.ConfirmationURL \}\}|supabase\.co\/auth\/v1\/verify|http:\/\/localhost/);
 const guide=read("docs/email/APEX_PASSWORD_RECOVERY_SETUP_20261114.md");
 assert.match(guide,/Reset your Apex Anabolics password/);
 assert.match(guide,/accounts@apexanabolics\.co/);
});
test("private nonpayable order release remains independent of password recovery",()=>{
 const source=read("src/app/api/checkout/nonpayable/v1/route.ts");
 assert.match(source,/isRetailNonpayableSubmissionEnabledV1\(process\.env\)/);
 assert.doesNotMatch(source,/APEX_RECOVERY_|resetPasswordForEmail|password-recovery-v1/);
});
