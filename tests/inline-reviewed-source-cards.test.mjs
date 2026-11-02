import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewedImportDraftPlan,validateReviewedDraftSelection,REVIEWED_DRAFT_BATCH_LIMIT}
 from "../src/lib/catalog/reviewed-import-draft-batch.mjs";
import {sourceReviewSummary} from "../src/lib/catalog/bulk-source-review.mjs";

const read=p=>readFileSync(p,"utf8");
const candidate={
 id:"11111111-1111-4111-8111-111111111111",
 source_index:0,product_name:"5-Amino-1 MQ",strength:"5 MG",
 wholesale_cost_cents:1000,review_status:"unverified",
};

test("unverified source has a preview but cannot create an actual product card",()=>{
 const summary=sourceReviewSummary(candidate,false);
 assert.equal(summary?.status,"unverified");
 assert.equal(reviewedImportDraftPlan(candidate,false)?.status,"requires_review");
 const reviewed=reviewedImportDraftPlan({...candidate,review_status:"approved_for_draft"},false);
 assert.equal(reviewed?.status,"ready");
 assert.equal(reviewed?.startingStock,0);
 assert.equal(reviewed?.mayPublish,false);
 assert.equal(reviewed?.mayCreateOrder,false);
 assert.equal(reviewedImportDraftPlan({...candidate,review_status:"approved_for_draft"},true)?.status,"already_saved");
});

test("review and private card creation are composed in one authenticated page",()=>{
 const page=read("src/app/supplier/imports/bulk-review/page.tsx");
 const panel=read("src/app/supplier/imports/bulk-review/bulk-review-panel.tsx");
 const form=read("src/app/supplier/imports/bulk-drafts/reviewed-draft-batch-form.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/stores\.length!==1/);
 assert.match(page,/source\.count!==source\.data\?\.length/);
 assert.match(page,/linkedIds\.has\(candidate\.id\)/);
 assert.match(page,/reviewedImportDraftPlan\(candidate,linkedIds\.has\(candidate\.id\)\)/);
 assert.match(page,/\.filter\(plan=>plan\?\.status==="ready"\)/);
 assert.match(page,/<BulkSourceReviewPanel /);
 assert.match(page,/<ReviewedDraftBatchForm /);
 assert.match(page,/href="#create-reviewed-drafts"/);
 assert.match(panel,/Refresh approved entries/);
 assert.match(panel,/router\.refresh\(\)/);
 assert.match(form,/id="create-reviewed-drafts"/);
 assert.match(form,/selectedReady=selected\.filter\(id=>eligible\.has\(id\)\)/);
 assert.match(form,/value=\{JSON\.stringify\(selectedReady\)\}/);
});

test("server controls cannot auto approve sources or sell saved drafts",()=>{
 const review=read("src/app/supplier/imports/bulk-review/actions.ts");
 const draft=read("src/app/supplier/imports/bulk-drafts/actions.ts");
 assert.match(review,/verifiedSourceRecords/);
 assert.match(review,/validateSourceReviewBatch\(parsed\)/);
 assert.match(review,/m\.role\)\)/);
 assert.match(draft,/validateReviewedDraftSelection\(parsed\)/);
 assert.match(draft,/reviewConfirmed/);
 assert.match(draft,/reviewedImportDraftPlan\(byId\.get\(id\),linked\.has\(id\)\)/);
 assert.match(draft,/p_quantity_on_hand:0/);
 assert.match(draft,/p_candidate_id:plan\.candidateId/);
 assert.doesNotMatch(draft,/is_published:\s*true|createInvoice|APEX_PUBLIC_SOLD_OUT_CATALOG|service_role/i);
 assert.equal(REVIEWED_DRAFT_BATCH_LIMIT,10);
 assert.equal(validateReviewedDraftSelection([candidate.id])?.length,1);
 assert.equal(validateReviewedDraftSelection([candidate.id,candidate.id]),null);
});
