import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("profile details require an authenticated, verified user", () => {
  const actions = source("../src/app/account/profile/details-actions.ts");
  assert.match(actions, /client\.auth\.getUser\(\)/);
  assert.match(actions, /data\.user\.is_anonymous/);
  assert.match(actions, /data\.user\.email_confirmed_at/);
  assert.match(actions, /client\.auth\.updateUser\(/);
  assert.doesNotMatch(actions, /service_role|admin\.updateUserById/);
});

test("profile data is not used as authorization", () => {
  const actions = source("../src/app/account/profile/details-actions.ts");
  const admin = source("../src/lib/auth/admin-access.ts");
  assert.match(actions, /apex_profile: details/);
  assert.match(admin, /app_metadata\?\.apex_role/);
  assert.doesNotMatch(admin, /user_metadata|apex_profile/);
});

test("account menu is dismissible and role-aware", () => {
  const menu = source("../src/app/account-menu.tsx");
  assert.match(menu, /pointerdown/);
  assert.match(menu, /addEventListener\("scroll"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /\{admin && <Link href="\/admin"/);
  assert.match(menu, /\{supplier && <Link href="\/supplier"/);
  assert.match(menu, /signOutAccount/);
});

test("unified login checks permissions on the server", () => {
  const login = source("../src/app/account/sign-in/actions.ts");
  assert.match(login, /client\.auth\.getUser\(\)/);
  assert.match(login, /isVerifiedPlatformAdmin\(data\.user\)/);
  assert.match(login, /from\("supplier_memberships"\)/);
  assert.match(login, /redirect\("\/account\/profile"\)/);
});
