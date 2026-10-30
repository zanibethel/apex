import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = p => readFileSync(p, "utf8");

test("profile checks signed-in user and email verification", () => {
  const source = read("src/app/account/profile/page.tsx");
  assert.match(source, /auth.getUser\(\)/);
  assert.match(source, /is_anonymous/);
  assert.match(source, /email_confirmed_at/);
  assert.match(source, /redirect\("\/admin\/sign-in"\)/);
  assert.doesNotMatch(source, /admin\.listUsers|service_role|signUp\(/);
});

test("changing password demands present and confirmed current credentials", () => {
  const source = read("src/app/account/profile/actions.ts");
  assert.match(source, /currentPassword/);
  assert.match(source, /confirmPassword/);
  assert.match(source, /next.length < 12/);
  assert.match(source, /next !== confirmation/);
  assert.match(source, /auth.signInWithPassword/);
  assert.match(source, /checked.user.id !== original.id/);
  assert.match(source, /reverified.user\?\.id !== original.id/);
  assert.match(source, /auth.updateUser/);
  assert.match(source, /current_password: current/);
  assert.match(source, /signOut\(\{ scope: "global" \}\)/);
  assert.doesNotMatch(source, /auth.admin|service_role|user_metadata|console.log/);
});

test("password form never exposes password values in URL or as ordinary data", () => {
  const form = read("src/app/account/profile/form.tsx");
  assert.match(form, /type="password"/);
  assert.match(form, /autoComplete="current-password"/);
  assert.match(form, /autoComplete="new-password"/);
  assert.match(form, /minLength=\{12\}/);
  assert.match(form, /action=\{action\}/);
  assert.doesNotMatch(form, /<a href=.*password|localStorage|sessionStorage/);
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /"\/account\/:path\*"/);
});

test("profile navigation is available for authorized admins and suppliers", () => {
  assert.match(read("src/app/admin/page.tsx"), /href="\/account\/profile"/);
  assert.match(read("src/app/supplier/page.tsx"), /href="\/account\/profile"/);
});

test("reauthentication security code is requested only for a verified signed-in account", () => {
  const source = read("src/app/account/profile/actions.ts");
  assert.match(source, /auth.reauthenticate\(\)/);
  assert.match(source, /requestPasswordCode/);
  assert.match(source, /email_confirmed_at/);
  assert.match(read("src/app/account/profile/form.tsx"), /action=\{sendCode\}/);
});
