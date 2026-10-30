import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("privileged Auth client is server-only, Apex-scoped, and disabled by default", () => {
  const file = source("src/lib/auth/admin-service.ts");
  assert.match(file, /import "server-only"/);
  assert.match(file, /fhqpkpztercadcxspdkg\.supabase\.co/);
  assert.match(file, /APP_MODE !== "demo"/);
  assert.match(file, /SUPABASE_SECRET_KEY/);
  assert.match(file, /startsWith\("sb_secret_"\)/);
  assert.match(file, /APEX_AUTH_INVITES_ENABLED === "true"/);
  assert.doesNotMatch(file, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});

test("invitation action authenticates administrator before privileged mutation", () => {
  const action = source("src/app/admin/users/actions.ts");
  const authAt = action.indexOf("auth.getUser()");
  const allowAt = action.indexOf("isVerifiedPlatformAdmin(data.user)");
  const inviteAt = action.indexOf("admin.auth.admin.inviteUserByEmail");
  assert.ok(authAt >= 0 && allowAt > authAt && inviteAt > allowAt);
  assert.match(action, /areApexInvitationsEnabled\(\)/);
  assert.doesNotMatch(action, /updateUserById|deleteUser|signUp\(|app_metadata:|user_metadata:/);
});

test("directory checks verified platform role on every request", () => {
  const page = source("src/app/admin/users/page.tsx");
  assert.match(page, /auth.getUser\(\)/);
  assert.match(page, /isVerifiedPlatformAdmin\(data.user\)/);
  assert.match(page, /auth.admin.listUsers/);
  assert.match(page, /force-dynamic/);
  assert.doesNotMatch(page, /insert\(|update\(|delete\(/);
});
