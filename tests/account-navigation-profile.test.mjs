import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(file, "utf8");

test("public header hides direct staff sign-in links while showing universal menu", () => {
  const header = read("src/components/site-header.tsx");
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<SiteHeader \/>/);
  assert.match(header, /<details className="apex-menu">/);
  assert.match(header, /Product categories/);
  assert.match(header, /href="\/login"/);
  assert.doesNotMatch(header, /href="\/admin\/sign-in"|href="\/supplier\/sign-in"/);
  assert.match(header, /isVerifiedPlatformAdmin\(user\)/);
  assert.match(header, /supplier_memberships/);
  assert.match(header, /signOutAccount/);
});

test("one account login verifies Auth and routes by role, never by emails", () => {
  const login = read("src/app/login/actions.ts");
  const router = read("src/app/account/page.tsx");
  assert.match(login, /auth\.signInWithPassword/);
  assert.match(login, /auth\.getUser\(\)/);
  assert.match(login, /redirect\("\/account"\)/);
  assert.match(router, /isVerifiedPlatformAdmin\(user\)/);
  assert.match(router, /supplier_memberships/);
  assert.match(router, /redirect\("\/admin"\)/);
  assert.match(router, /redirect\("\/supplier"\)/);
  assert.match(router, /redirect\("\/account\/profile"\)/);
  assert.doesNotMatch(router, /user_metadata|email\s*===|service_role/);
});

test("self-only private profile has RLS and never stores user-controlled roles", () => {
  const sql = read("database/sql/apex_account_profiles_review.sql");
  const save = read("src/app/account/profile/details-actions.ts");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /for insert to authenticated with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /for update to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(sql, /grant.*delete|service_role|payout_address|wallet_secret/);
  assert.match(save, /auth\.getUser\(\)/);
  assert.match(save, /user_id: data\.user\.id/);
  assert.match(save, /upsert\(/);
  assert.doesNotMatch(save, /user_metadata|service_role|auth\.admin|console\.log/);
});

test("profile grants additional UI links only from verified admin or supplier membership", () => {
  const page = read("src/app/account/profile/page.tsx");
  assert.match(page, /auth\.getUser\(\)/);
  assert.match(page, /isVerifiedPlatformAdmin\(user\)/);
  assert.match(page, /supplier_memberships/);
  assert.match(page, /\(admin \|\| supplier\)/);
  assert.match(page, /href="\/supplier\/wallets"/);
  assert.match(page, /href="\/admin\/splits"/);
  assert.doesNotMatch(page, /user_metadata|service_role|email\s*===/);
});
