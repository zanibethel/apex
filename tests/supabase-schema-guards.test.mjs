import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sql = readFileSync(join(process.cwd(), "database/sql/apex_catalog_foundation_review.sql"), "utf8");
const tables = ["suppliers", "stores", "supplier_memberships", "categories", "products", "inventory_items"];

test("all six exposed tables explicitly enable RLS", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security", "i"));
  }
});
test("client roles have no write permissions or write policies in review SQL", () => {
  assert.match(sql, /revoke all on public\.suppliers[\s\S]*from PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(sql, /create policy[^;]+for\s+(?:insert|update|delete|all)\s+to\s+(?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)\s+on\s+public\./i);
});
test("catalog publication and supplier isolation are explicit", () => {
  assert.match(sql, /create policy "public_product_read"[\s\S]*?is_published and exists/i);
  assert.match(sql, /create policy "member_product_read"[\s\S]*?sm\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /products_category_same_store foreign key \(store_id, category_id\)/i);
  assert.match(sql, /create policy "member_inventory_read"/i);
});

const versionedMigration = readFileSync(join(process.cwd(), "supabase/migrations/20261029233701_apex_initial_catalog_readonly.sql"), "utf8");
test("checked-in Supabase migration matches reviewed SQL byte-for-byte", () => {
  assert.equal(versionedMigration, sql);
});
