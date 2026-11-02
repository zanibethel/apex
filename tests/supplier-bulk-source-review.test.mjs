import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 sourceReviewSummary,validateSourceReviewBatch,
 SOURCE_REVIEW_BATCH_LIMIT,SOURCE_REVIEW_ACTIONS,
} from "../src/lib/catalog/bulk-source-review.mjs";
const read=path=>readFileSync(path,"utf8");
const id=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const row={id:id(1),store_id:id(100),source_index:5,product_name:"BPC-157",
 strength:"10 MG",wholesale_cost_cents:1170,review_status:"unverified"};
const item=(n,checked=false)=>({id:id(n),status:"unverified",costCents:1170,checked});

test("private bulk review summarizes exact source cents and 2x/2.5x without granting sale rights",()=>{
 const data=sourceReviewSummary(row);
 assert.equal(data.name,"BPC-157");
 assert.equal(data.status,"unverified");
 assert.equal(data.costCents,1170);
 assert.equal(data.retailCents,2340);
 assert.equal(data.compareAtCents,2925);
 assert.match(data.description,/10 MG/);
 assert.equal(data.validForDraft,true);
 assert.equal(data.publicEligible,false);
 assert.equal(data.purchasable,false);
 assert.ok(Object.isFrozen(data));
 assert.equal(sourceReviewSummary(row,true).linked,true);
 assert.equal(sourceReviewSummary({...row,product_name:"UNKNOWN"}).validForDraft,false);
 assert.equal(sourceReviewSummary({...row,product_name:"SLU-PP-322"}).needsIdentityCheck,true);
 assert.equal(sourceReviewSummary({...row,source_index:-1}),null);
});

test("approval requires explicit item-by-item confirmation and max 20 unique IDs",()=>{
 const batch=validateSourceReviewBatch({action:"approved_for_draft",rows:[item(1,true),item(2,true)]});
 assert.equal(batch.action,"approved_for_draft");
 assert.equal(batch.rows.length,2);
 assert.ok(Object.isFrozen(batch));
 assert.equal(SOURCE_REVIEW_BATCH_LIMIT,20);
 assert.deepEqual(SOURCE_REVIEW_ACTIONS,["under_review","hold","approved_for_draft"]);
 for(const invalid of [
  {action:"approved_for_draft",rows:[item(1,false)]},
  {action:"approve_public",rows:[item(1,true)]},
  {action:"hold",rows:[]},
  {action:"hold",rows:[item(1),item(1)]},
  {action:"under_review",rows:[{...item(1),costCents:0}]},
  {action:"under_review",rows:[{...item(1),costCents:Infinity}]},
  {action:"under_review",rows:[{...item(1),status:"published"}]},
  {action:"under_review",rows:[{...item(1),checked:"yes"}]},
  {action:"under_review",rows:[{...item(1),clientPrice:1}]},
  {action:"hold",rows:Array.from({length:21},(_,n)=>item(n+1))},
  {},null,false,[],
 ]){
  assert.equal(validateSourceReviewBatch(invalid),null,JSON.stringify(invalid)?.slice(0,100));
 }
 assert.equal(validateSourceReviewBatch({action:"hold",rows:[item(1)]}).rows[0].checked,false);
});

test("review action enforces owner/manager, private store, fresh cost/status and audit RLS",()=>{
 const action=read("src/app/supplier/imports/bulk-review/actions.ts");
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true"/);
 assert.match(action,/validateSourceReviewBatch\(parsed\)/);
 assert.match(action,/form\.get\("verifiedSourceRecords"\)!=="yes"/);
 assert.match(action,/getSupplierWorkspace\(\)/);
 assert.match(action,/!s\.is_public/);
 assert.match(action,/\["owner","manager"\]\.includes\(m\.role\)/);
 assert.match(action,/from\("supplier_import_candidates"\)/);
 assert.match(action,/from\("supplier_candidate_drafts"\)/);
 assert.match(action,/status!==selected\.status/);
 assert.match(action,/costCents!==selected\.costCents/);
 assert.match(action,/summary\.linked/);
 assert.match(action,/\.eq\("review_status",selected\.status\)/);
 assert.match(action,/\.eq\("wholesale_cost_cents",selected\.costCents\)/);
 assert.match(action,/\.select\("id"\)\.maybeSingle\(\)/);
 assert.match(action,/revalidatePath\("\/supplier\/imports\/bulk-drafts"\)/);
 assert.doesNotMatch(action,/\.insert\(|is_published:\s*true|service_role|createInvoice|\bcreateOrder\b|public\.stores.*is_public:true/);
});

test("private review dashboard is complete, read-only by default, and mobile-friendly",()=>{
 const page=read("src/app/supplier/imports/bulk-review/page.tsx");
 const panel=read("src/app/supplier/imports/bulk-review/bulk-review-panel.tsx");
 const css=read("src/app/supplier/imports/bulk-review/bulk-review.css");
 const imported=read("src/app/supplier/imports/page.tsx");
 const drafts=read("src/app/supplier/imports/bulk-drafts/page.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/!s\.is_public/);
 assert.match(page,/source\.count!==source\.data\?\.length/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.match(page,/\.createSignedUrl\(originalImage,120\)/);
 assert.match(page,/enabled=\{process\.env\.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"\}/);
 assert.match(panel,/setFilter/);
 assert.match(panel,/type="search"/);
 assert.match(panel,/Select visible \(up to 20\)/);
 assert.match(panel,/source cost/i);
 assert.match(panel,/individually reviewed/i);
 assert.match(panel,/name="verifiedSourceRecords"/);
 assert.match(panel,/action==="approved_for_draft"/);
 assert.match(panel,/approvalsReady&&overall/);
 assert.match(panel,/public.*storefront|public.*products|purchasable/i);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(imported,/href="\/supplier\/imports\/bulk-review"/);
 assert.match(drafts,/href="\/supplier\/imports\/bulk-review"/);
 assert.doesNotMatch(page+panel,/NEXT_PUBLIC_SUPABASE_SECRET|createPublicUrl|createInvoice|service_role|Add to cart/);
});

test("review audits remain owned by current RLS policy and triggers, not a new privileged bypass",()=>{
 const schema=read("database/sql/apex_private_supplier_import_review.sql");
 assert.match(schema,/supplier_private_import_review/);
 assert.match(schema,/m\.user_id|sm\.user_id/);
 assert.match(schema,/after update of review_status/);
 assert.match(schema,/supplier_candidate_review_audit/);
 assert.match(schema,/supplier_import_review_audit/);
});
