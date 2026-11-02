import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewedImportDraftPlan,validateReviewedDraftSelection,REVIEWED_DRAFT_BATCH_LIMIT}
 from "../src/lib/catalog/reviewed-import-draft-batch.mjs";

const uuid=id=>`00000000-0000-4000-8000-${String(id).padStart(12,"0")}`;
const row={id:uuid(1),source_index:1,product_name:"BPC-157",strength:"10 MG",
 wholesale_cost_cents:"1170",review_status:"approved_for_draft"};

test("reviewed source creates private-only zero-stock 2x/2.5x plan",()=>{
 const result=reviewedImportDraftPlan(row);
 assert.equal(result.status,"ready");
 assert.equal(result.salePriceCents,2340);
 assert.equal(result.proposedCompareAtCents,2925);
 assert.equal(result.sourceCostCents,1170);
 assert.equal(result.startingStock,0);
 assert.equal(result.mayPublish,false);
 assert.equal(result.mayCreateOrder,false);
 assert.match(result.description,/BPC-157 — 10 MG/);
 assert.ok(Object.isFrozen(result));
});
test("unverified and held sources cannot be batched, and saved sources cannot duplicate",()=>{
 for(const review_status of ["unverified","under_review","hold"]){
  const result=reviewedImportDraftPlan({...row,review_status});
  assert.equal(result.status,"requires_review");
  assert.equal(result.startingStock,0);
 }
 assert.equal(reviewedImportDraftPlan(row,true).status,"already_saved");
 assert.equal(reviewedImportDraftPlan({...row,wholesale_cost_cents:"-4"}).status,"invalid_source");
 assert.equal(reviewedImportDraftPlan({...row,product_name:"Not in descriptions"}).status,"invalid_source");
 assert.equal(reviewedImportDraftPlan(null),null);
});
test("a batch cannot exceed 10 or contain duplicate or non-UUID candidate IDs",()=>{
 assert.equal(REVIEWED_DRAFT_BATCH_LIMIT,10);
 assert.deepEqual(validateReviewedDraftSelection([uuid(1),uuid(2)]),[uuid(1),uuid(2)]);
 for(const value of [[],null,{},["fake"],[uuid(1),uuid(1)],
   Array.from({length:11},(_,i)=>uuid(i+1))])
  assert.equal(validateReviewedDraftSelection(value),null);
});
test("bulk create action uses trusted membership, only approved source, atomic RLS RPC and zero stock",()=>{
 const source=readFileSync("src/app/supplier/imports/bulk-drafts/actions.ts","utf8");
 const page=readFileSync("src/app/supplier/imports/bulk-drafts/page.tsx","utf8");
 const form=readFileSync("src/app/supplier/imports/bulk-drafts/reviewed-draft-batch-form.tsx","utf8");
 assert.match(source,/APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true"/);
 assert.match(source,/form\.get\("reviewConfirmed"\)!=="yes"/);
 assert.match(source,/getSupplierWorkspace\(\)/);
 assert.match(source,/s\.is_public/);
 assert.match(source,/\["owner","manager"\]\.includes\(m\.role\)/);
 assert.match(source,/validateReviewedDraftSelection\(parsed\)/);
 assert.match(source,/w\.client\.from\("supplier_import_candidates"\)/);
 assert.match(source,/status!=="ready"/);
 assert.match(source,/create_draft_from_candidate_with_compare/);
 assert.match(source,/p_quantity_on_hand:0/);
 assert.match(source,/p_retail_price_cents:plan\.salePriceCents/);
 assert.match(source,/p_compare_at_price_cents:plan\.proposedCompareAtCents/);
 assert.match(source,/p_description:plan\.description/);
 assert.match(source,/internal_source_cost_cents:plan\.sourceCostCents/);
 assert.match(source,/\.eq\("is_published",false\)/);
 assert.doesNotMatch(source,/\bis_published:\s*true|\.update\(\{review_status|createInvoice|BTCPay|service_role/i);
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/source\.count!==source\.data\?\.length/);
 assert.match(page,/Awaiting source review/);
 assert.match(form,/required disabled=\{!enabled\|\|pending\}/);
 assert.match(form,/name="candidateIds"/);
 assert.match(form,/name="reviewConfirmed"/);
 assert.match(form,/disabled=\{!enabled\|\|pending\|\|selected\.length===0\}/);
});
test("customer storefront still cannot read imported sources or create real orders",()=>{
 const catalog=readFileSync("src/app/catalog/page.tsx","utf8");
 const publicSource=readFileSync("src/lib/supabase/public-catalog.ts","utf8");
 assert.doesNotMatch(catalog+publicSource,/supplier_import_candidates|supplier_candidate_drafts|internal_source_cost_cents/);
 assert.match(publicSource,/select.*id,name,description/);
});
