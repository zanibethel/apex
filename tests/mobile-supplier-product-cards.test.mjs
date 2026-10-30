import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const page=read("src/app/supplier/catalog/page.tsx");
const css=read("src/app/globals.css");
const action=read("src/app/supplier/catalog/source-cost-actions.ts");
const sql=read("database/sql/apex_supplier_cost_edit_audit.sql");

test("all source variants and standalone drafts are responsive cards without a forced side scroll",()=>{
 assert.match(page,/apex-product-grid/);
 assert.match(page,/candidates\.data\.map\(/);
 assert.match(page,/products\.data\.filter\(/);
 assert.match(page,/\.limit\(100\)/);
 assert.match(css,/grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,320px\),1fr\)\)/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.doesNotMatch(page,/<table\b|minWidth:650|minWidth:680|overflowX:"auto"/);
});

test("supplier cards display editable acquisition cost distinct from retail and compare-at",()=>{
 assert.match(page,/SourceCostEditor/);
 assert.match(page,/costCents=/);
 assert.match(page,/ProductRowEditor/);
 assert.match(page,/comparePrice=/);
 assert.match(page,/Purchase price/);
 assert.match(page,/ProductImageUploader/);
 assert.match(page,/Create private draft|PromoteReviewedVariantForm/);
});

test("source cost updates are price-range validated, tenancy scoped and optimistic",()=>{
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(action,/owner/);
 assert.match(action,/manager/);
 assert.match(action,/\.eq\("wholesale_cost_cents",expected\)/);
 assert.match(action,/revalidatePath\("\/supplier\/catalog"\)/);
 assert.doesNotMatch(action,/service_role|auth\.admin|is_published:true/);
});

test("supplier-only source cost writes have immutable audit and do not alter retail",()=>{
 assert.match(sql,/grant update \(wholesale_cost_cents\) on public\.supplier_import_candidates to authenticated/);
 assert.match(sql,/supplier_source_cost_audit enable row level security/);
 assert.match(sql,/created_at|changed_at/);
 assert.match(sql,/apex_internal\.audit_source_cost/);
 assert.match(sql,/old\.wholesale_cost_cents,new\.wholesale_cost_cents/);
 assert.doesNotMatch(sql,/grant update \(product_name|grant insert on public\.products/);
});

test("approved draft conversion supports customer purchase price plus optional compare-at atomically",()=>{
 const form=read("src/app/supplier/imports/promote-form.tsx");
 const promotion=read("src/app/supplier/imports/actions.ts");
 assert.match(form,/name="retailPrice"/);
 assert.match(form,/name="comparePrice"/);
 assert.match(promotion,/create_draft_from_candidate_with_compare/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/create_draft_from_supplier_candidate\(/);
 assert.match(sql,/compare_at_price_cents/);
});
