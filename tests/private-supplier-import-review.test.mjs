import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(path,"utf8");

test("wholesale data review queue is private and never published",()=>{
 const sql=read("database/sql/apex_private_supplier_import_review.sql");
 assert.match(sql,/supplier_import_candidates/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.supplier_import_candidates/);
 assert.match(sql,/grant select, update\(review_status\)/);
 assert.match(sql,/supplier_private_import_read/);
 assert.match(sql,/supplier_private_import_review/);
 assert.match(sql,/supplier_import_review_audit/);
 assert.doesNotMatch(sql,/grant insert.*authenticated|grant update\(wholesale_cost_cents\)/i);
});
test("review action verifies membership and never creates a retail product",()=>{
 const action=read("src/app/supplier/imports/actions.ts");
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/owner/);
 assert.match(action,/manager/);
 assert.match(action,/\.update\(\{review_status:status\}\)/);
 assert.doesNotMatch(action,/\.from\("products"\)|\.from\("inventory_items"\)|service_role/);
});
test("review page distinguishes wholesale data from retail price and stock",()=>{
 const page=read("src/app/supplier/imports/page.tsx");
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/supplier_import_candidates/);
 assert.match(page,/wholesale/);
 assert.match(page,/not retail listings/);
 assert.match(page,/No source entries/);
 assert.match(read("src/app/supplier/page.tsx"),/\/supplier\/imports/);
});
