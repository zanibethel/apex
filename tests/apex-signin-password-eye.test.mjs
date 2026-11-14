import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(path,"utf8");

test("all Apex sign-in forms share the same inline password visibility toggle",()=>{
 const component=read("src/components/auth/sign-in-password-field.tsx");
 const signup=read("src/app/account/sign-up/form.tsx");
 const styles=read("src/app/account/sign-up/password-visibility.module.css");
 assert.match(component,/^"use client";/);
 assert.match(component,/useState\(false\)/);
 assert.match(component,/name="password" type=\{visible\?"text":"password"\}/);
 assert.match(component,/autoComplete="current-password"/);
 assert.match(component,/type="button" className=\{styles\.toggle\}/);
 assert.match(component,/aria-label=\{visible\?"Hide password":"Show password"\}/);
 assert.match(component,/aria-pressed=\{visible\} aria-controls=\{id\}/);
 assert.match(component,/onClick=\{\(\)=>setVisible\(value=>!value\)\}/);
 assert.match(component,/aria-hidden="true" focusable="false"/);
 assert.match(component,/minWidth|className=\{styles\.field\}/);
 const existingEye=signup.match(/<path d="(M2 12s[^"]+)"\/>/)?.[1];
 assert.ok(existingEye,"Signup must include the original eye icon");
 assert.ok(component.includes(`<path d="${existingEye}"/>`),"Sign-in must exactly match signup eye geometry");
 assert.match(styles,/position:relative/);
 assert.match(styles,/padding-right:64px/);
 assert.match(styles,/width:48px;height:48px/);
 for(const [path,id,action] of [
  ["src/app/account/sign-in/page.tsx","account-password","signInAccount"],
  ["src/app/supplier/sign-in/page.tsx","supplier-password","signInSupplier"],
  ["src/app/admin/sign-in/page.tsx","admin-password","signInAdmin"],
 ]){
  const page=read(path);
  assert.match(page,/import \{ SignInPasswordField \} from "@\/components\/auth\/sign-in-password-field";/);
  assert.ok(page.includes('<SignInPasswordField id="'+id+'" />'));
  assert.match(page,/className="supplier-form"/);
  assert.ok(page.includes(action));
  assert.doesNotMatch(page,/type="password"/);
 }
});

test("visibility component changes appearance only, not authorization or passwords",()=>{
 const component=read("src/components/auth/sign-in-password-field.tsx");
 assert.doesNotMatch(component,/auth\.|supabase|fetch\(|localStorage|sessionStorage|console\.|formAction|type="submit"|password\s*=\s*["']/);
 const account=read("src/app/account/sign-in/actions.ts");
 const admin=read("src/app/admin/sign-in/actions.ts");
 const supplier=read("src/app/supplier/sign-in/actions.ts");
 assert.match(account,/isVerifiedPlatformAdmin/);
 assert.match(admin,/isVerifiedPlatformAdmin/);
 assert.match(supplier,/supplier_memberships/);
 assert.match(supplier,/auth\.signOut\(\)/);
});
