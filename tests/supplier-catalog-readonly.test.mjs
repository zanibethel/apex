import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/supplier/catalog/page.tsx", "utf8");
const home = readFileSync("src/app/supplier/page.tsx", "utf8");

test("catalog requires a verified Supabase user and scoped membership", () => {
  assert.match(page, /auth.getUser\(\)/);
  assert.match(page, /email_confirmed_at/);
  assert.match(page, /is_anonymous/);
  assert.match(page, /supplier_memberships/);
  assert.match(page, /redirect\("\/supplier\/sign-in"\)/);
  assert.match(page, /!memberships\?\.length/);
});

test("catalog scopes every table to the member's storefront", () => {
  assert.match(page, /\.from\("stores"\)/);
  assert.match(page, /\.in\("supplier_id",memberships\.map\(/);
  for (const table of ["products", "categories", "inventory_items", "supplier_import_candidates", "supplier_candidate_drafts"]) {
    assert.match(page, new RegExp('\\.from\\("'+table+'"\\)'));
  }
  assert.equal((page.match(/\.in\("store_id",\s*ids\)/g) ?? []).length, 7);
  assert.match(page, /limit\(100\)/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|service_role|auth\.admin|NEXT_PUBLIC_SUPABASE_SECRET/);
});

test("shows a private read-only view with no public checkout or write path", () => {
  assert.match(page, /Read-only preview/);
  assert.match(page, /No products yet/);
  assert.match(page, /Stock|Inventory|on hand/i);
  assert.match(page, /is_published/);
  assert.match(home, /href="\/supplier\/catalog"/);
});
