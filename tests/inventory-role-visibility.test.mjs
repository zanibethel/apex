import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const inventory = readFileSync("src/app/supplier/inventory/page.tsx", "utf8");
const action = readFileSync("src/app/supplier/operations/actions.ts", "utf8");

test("inventory edit controls require an owner or manager of the assigned private store", () => {
  assert.match(inventory, /member\.role === "owner" \|\| member\.role === "manager"/);
  assert.match(inventory, /!store\.is_public && managingSupplierIds\.has\(store\.supplier_id\)/);
  assert.match(inventory, /editableStoreIds\.has\(item\.store_id\)/);
  assert.match(inventory, /product !== undefined && product\.store_id === item\.store_id/);
  assert.match(inventory, /product\.is_published === false/);
  assert.match(inventory, /APEX_DRAFT_CATALOG_WRITES_ENABLED/);
  assert.match(inventory, /editable\s*\?\s*<StockEditor/);
  assert.doesNotMatch(inventory, /enabled=\{enabled && !!product/);
});

test("server still reauthorizes and checks stock version regardless of UI visibility", () => {
  assert.match(action, /const store=await authorizedStore\(form\)/);
  assert.match(action, /\.in\("role",\["owner","manager"\]\)/);
  assert.match(action, /\.eq\("is_public",false\)/);
  assert.match(action, /\.eq\("is_published", false\)/);
  assert.match(action, /\.eq\("quantity_on_hand",expected\)/);
  assert.doesNotMatch(action, /service_role|auth\.admin/);
});
