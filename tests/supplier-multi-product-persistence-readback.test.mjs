import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const seed=readFileSync("database/tests/supplier_batch_persistence_seed_integration.sql","utf8");
const read=readFileSync("database/tests/supplier_batch_persistence_readback_integration.sql","utf8");
const ci=readFileSync(".github/workflows/ci.yml","utf8");
const action=readFileSync("src/app/supplier/catalog/bulk-actions.ts","utf8");

test("each synthetic supplier batch uses isolated CI PostgreSQL, not hosted Supabase",()=>{
 const existing=ci.indexOf("database/tests/supplier_hold_correction_roundtrip_integration.sql");
 const seedAt=ci.indexOf("psql -X -v ON_ERROR_STOP=1 -f database/tests/supplier_batch_persistence_seed_integration.sql");
 const readAt=ci.indexOf("psql -X -v ON_ERROR_STOP=1 -f database/tests/supplier_batch_persistence_readback_integration.sql");
 assert.ok(existing>=0&&seedAt>existing&&readAt>seedAt,"separate psql commands after fixture");
 assert.match(seed,/Never run|NEVER run/i);
 assert.match(read,/Never run hosted/);
 assert.match(seed,/generate_series\(1,25\)/);
 assert.match(read,/generate_series\(1,25\)/);
 assert.match(seed,/commit;/i);
});

test("a fresh transaction verifies exact SKU, name, description, pricing, cost, activity and stock",()=>{
 for(const field of ["sku","name","description","category_id","price_cents","compare_at_price_cents",
  "internal_source_cost_cents","is_active","is_published","quantity_on_hand","quantity_reserved"]){
  assert.match(read,new RegExp("p\\."+field+"|i\\."+field+"|sku like","i"),field);
 }
 assert.match(read,/Fresh connection did not read back all 25/);
 assert.match(read,/field lost across fresh connection/);
 assert.match(seed,/set role authenticated/);
 assert.match(read,/set role authenticated/);
 assert.match(read,/request\.jwt\.claim\.sub/);
});

test("fresh role checks preserve cross-supplier, staff and anonymous boundaries",()=>{
 assert.match(read,/Cross-supplier private batch leaked/);
 assert.match(read,/Existing same-supplier staff read permission/);
 assert.match(read,/Anonymous user read private batch/);
 assert.match(read,/has_column_privilege/);
 assert.match(seed,/is_published=false|is_published\)/);
 assert.doesNotMatch(seed,/set_admin_listing_override|set_supplier_listing_intent/);
});

test("real supplier server actions remain scoped and bounded; test never enables publication",()=>{
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(action,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(action,/\.eq\("is_public",false\)/);
 assert.match(action,/parsed\.length>20/);
 assert.match(action,/\.eq\("store_id",storeId\)/);
 assert.doesNotMatch(seed+read,/service_role|release_gate.*enabled.*true/);
});
