import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("verified role controls admin access, never email or user metadata", () => {
  const rule = read("src/lib/auth/admin-access.ts");
  assert.match(rule, /app_metadata\?\.apex_role === "platform_admin"/);
  assert.match(rule, /email_confirmed_at/);
  assert.match(rule, /is_anonymous/);
  assert.doesNotMatch(rule, /user_metadata\?|user\.email\s*===/);
});

test("admin login verifies identity and signs out unauthorized users", () => {
  const action = read("src/app/admin/sign-in/actions.ts");
  assert.match(action, /signInWithPassword/);
  assert.match(action, /auth\.getUser\(\)/);
  assert.match(action, /isVerifiedPlatformAdmin/);
  assert.match(action, /auth\.signOut\(\)/);
  assert.doesNotMatch(action, /signUp\(|admin\.createUser\(|service_role|\.insert\(|\.update\(/);
});

test("admin dashboard rechecks user and grants read-only preview", () => {
  const dashboard = read("src/app/admin/page.tsx");
  assert.match(dashboard, /auth\.getUser\(\)/);
  assert.match(dashboard, /isVerifiedPlatformAdmin/);
  assert.match(dashboard, /redirect\("\/admin\/sign-in"\)/);
  assert.doesNotMatch(dashboard, /service_role|\.insert\(|\.update\(|\.delete\(/);
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /"\/supplier\/:path\*"/);
  assert.match(proxy, /"\/admin\/:path\*"/);
});
