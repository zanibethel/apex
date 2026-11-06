import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 supplierParentSnapshot,sameSupplierParentSnapshot,reviewFormula,
 SUPPLIER_OPTION_BATCH,
} from "../src/lib/catalog/supplier-parent-review-snapshot.mjs";

const read=path=>readFileSync(path,"utf8");
const makeRow=(id,oil,price,options={})=>({
 id,source_row:53,source_name:"Sample Blend",source_section:"Blends",
 strength:"Formula A(100mg)/Formula B(50mg)",
 size:"10mL",carrier_oil:oil,retail_price_cents:price,
 review_status:"pending_review",review_note:"",...options,
});
const a=makeRow("11111111-1111-4111-8111-111111111111","MCT",6200);
const b=makeRow("22222222-2222-4222-8222-222222222222","GSO",6200);

test("private review snapshot retains every formula, source and retail detail",()=>{
 const result=supplierParentSnapshot([b,a]);
 assert.equal(result.length,2);
 assert.equal(result[0].id,a.id);
 assert.equal(result[0].strength,"Formula A(100mg)/Formula B(50mg)");
 assert.equal(result[0].price,"6200");
 assert.equal(result[1].carrier,"GSO");
 assert.equal(reviewFormula(result[0].strength),result[0].strength);
 assert.equal(reviewFormula("100mg"),"");
 assert.equal(SUPPLIER_OPTION_BATCH,"supplier-initial-2026-11-05");
});
test("stale edits and even minor source changes invalidate previous approval",()=>{
 const current=supplierParentSnapshot([a,b]);
 assert.ok(sameSupplierParentSnapshot(current,JSON.parse(JSON.stringify(current))));
 const previous=JSON.parse(JSON.stringify(current));
 previous[0].price="6300";
 assert.equal(sameSupplierParentSnapshot(previous,current),false);
 const changedComposition=JSON.parse(JSON.stringify(current));
 changedComposition[0].strength="Formula A(200mg)/Formula B(50mg)";
 assert.equal(sameSupplierParentSnapshot(changedComposition,current),false);
});
test("duplicate or malformed rows fail closed",()=>{
 assert.equal(supplierParentSnapshot([]),null);
 assert.equal(supplierParentSnapshot([a,a]),null);
 assert.equal(supplierParentSnapshot([{...a,review_note:null}]),null);
 assert.equal(supplierParentSnapshot([{...a,source_row:-1}]),null);
});
test("all full formulas appear in card, not truncated or inserted as options",()=>{
 const page=read("src/app/supplier/catalog/variant-review/page.tsx");
 const card=read("src/components/catalog/compact-variant-card.tsx");
 const css=read("src/components/catalog/compact-variant-card.css");
 assert.match(page,/reviewFormula\(r\.strength\)/);
 assert.match(page,/compositionByVariantId\[r\.id\]=formula/);
 assert.match(page,/compositionByVariantId=\{group\.compositionByVariantId\}/);
 assert.match(card,/compositionByVariantId\?\.\[selected\.id\]/);
 assert.match(card,/Composition/);
 assert.match(css,/apex-compact-product-composition p\{[^}]*overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/apex-compact-product-composition p\{[^}]*-webkit-line-clamp/);
});
test("buttons only append isolated content-review events",()=>{
 const page=read("src/app/supplier/catalog/variant-review/page.tsx");
 const form=read("src/app/supplier/catalog/variant-review/review-controls.tsx");
 const action=read("src/app/supplier/catalog/variant-review/review-actions.ts");
 assert.match(page,/SupplierParentReviewControls/);
 assert.match(page,/group\.unresolved===0&&group\.ready\.length>0/);
 assert.match(page,/sameSupplierParentSnapshot/);
 assert.match(form,/value="approved"/);
 assert.match(form,/disabled=\{!canApprove\|\|pending\}/);
 assert.match(form,/value="needs_changes"/);
 assert.match(action,/\.from\("apex_supplier_parent_review_events"\)\.insert/);
 assert.match(action,/getUser\(\)/);
 assert.match(action,/in\("role",\["owner","manager"\]\)/);
 assert.match(action,/\.eq\("is_public",false\)/);
 assert.doesNotMatch(action,/service_role|\.from\("products"\)|\.from\("inventory_items"\)|set_supplier_listing_intent|createInvoice|localStorage|createOrder/);
});
test("database denies public content review and verifies exact latest snapshot",()=>{
 const sql=read("supabase/migrations/20261106135000_apex_supplier_parent_review_events_v1.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/force row level security/);
 assert.match(sql,/grant insert \(store_id,source_batch,parent_title,decision,note,reviewed_snapshot\)/);
 assert.match(sql,/reviewer_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/current_snapshot is distinct from new\.reviewed_snapshot/);
 assert.match(sql,/new\.decision='approved' and not coalesce\(all_priced,false\)/);
 assert.doesNotMatch(sql,/grant .* on public\.products|createInvoice|private_release_gate|grant update|grant delete/);
 assert.match(workflow,/private-supplier-parent-approval\.sql/);
});
