import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/supplier/page.tsx", "utf8");

test("supplier dashboard requires a verified server-side session and membership", () => {
  assert.match(page, /auth.getUser\(\)/);
  assert.match(page, /supplier_memberships/);
  assert.match(page, /redirect\("\/supplier\/sign-in"\)/);
  assert.match(page, /!memberships\?\.length/);
});

test("two supplier members share store by supplier_id, not separate user stores", () => {
  assert.match(page, /membership.*supplier_id|supplier_id.*membership/i);
  assert.match(page, /\.in\("supplier_id", supplierIds\)/);
  assert.match(page, /\.from\("stores"\)/);
  assert.match(page, /\.from\("products"\)/);
  assert.match(page, /\.from\("categories"\)/);
  assert.match(page, /\.from\("inventory_items"\)/);
  assert.match(page, /\.in\("store_id", storeIds\)/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|service_role|auth\.admin/);
});

test("supplier workspace advertises private, read-only product/inventory view", () => {
  assert.match(page, /Private draft/);
  assert.match(page, /not enabled/);
  assert.match(page, /\/account\/profile/);
});
