import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierImageCorrectionStatus} from "../src/lib/catalog/supplier-image-correction-status.mjs";
import {supplierStorefrontVisibility} from "../src/lib/catalog/supplier-storefront-visibility.mjs";
const read=path=>readFileSync(path,"utf8");

test("bulk card now offers private review submission in its existing details",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 const action=read("src/app/supplier/catalog/review-actions.ts");
 const form=read("src/app/supplier/catalog/review-submission.tsx");
 assert.match(page,/canSubmitReview:!reviewError&&setup\.setupComplete/);
 assert.match(page,/reviewStatus:reviewsByProduct.get\(p.id\)\?\.status/);
 assert.match(editor,/apex-bulk-card-top-actions/);
 assert.match(editor,/apex-bulk-card-status-row/);
 assert.match(editor,/apex-bulk-readiness-details/);
 assert.match(editor,/SupplierReviewSubmission storeId=\{storeId\} productId=\{r.id\}/);
 assert.match(editor,/Save your product changes first, then submit/);
 assert.match(editor,/Internal product review:/);
 assert.match(action,/submit_private_product_review/);
 assert.match(action,/revalidatePath\("\/supplier\/catalog\/bulk"\)/);
 assert.match(form,/router\.refresh\(\)/);
 assert.doesNotMatch(editor,/window\.open\(|createPublicUrl\(|service_role/);
});

test("review submission remains permission-scoped and private",()=>{
 const action=read("src/app/supplier/catalog/review-actions.ts");
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(action,/!auth\.user\.email_confirmed_at/);
 assert.match(action,/\["owner","manager"\]/);
 assert.match(action,/\.eq\("is_public",false\)/);
 assert.match(action,/submit_private_product_review/);
 assert.doesNotMatch(action,/update.*is_published|createInvoice|set_admin_listing_override/i);
});

test("an outdated correction cannot be displayed as current or automatically published",()=>{
 const product={store_id:"20000000-0000-4000-8000-000000000003",
  id:"40000000-0000-4000-8000-000000000090",image_path:"example"};
 const review={store_id:product.store_id,product_id:product.id,
  submission_id:"80000000-0000-4000-8000-000000000001",status:"changes_requested",
  snapshot:{image_path:"example"}};
 const feedback={store_id:product.store_id,product_id:product.id,
  submission_id:"80000000-0000-4000-8000-000000000002",
  image_path:"example",outcome:"needs_correction",supplier_note:"Change image"};
 assert.equal(supplierImageCorrectionStatus(product,review,feedback).kind,"changed");
 const verdict=supplierStorefrontVisibility({
  requested:true,available:true,adminGate:"hold",
 },{status_code:"public_visible",effective_public:true,checks:{}});
 assert.equal(verdict.publiclyVisible,false);
 assert.equal(verdict.kind,"held");
});

test("CI end-to-end fixture has rollback, tenant isolation, and independent public release gate",()=>{
 const sql=read("database/tests/full_supplier_card_workflow_e2e.sql");
 const workflow=read(".github/workflows/ci.yml");
 assert.match(workflow,/full_supplier_card_workflow_e2e\.sql/);
 assert.match(sql,/begin;/i);assert.match(sql,/rollback;/i);
 const assertions=[
  "create_private_draft_from_source","set_supplier_listing_intent",
  "submit_private_product_review","decide_private_product_review",
  "set_admin_listing_override","private_media_evidence_events",
  "supplier_media_feedback_events","resubmit_supplier_listing_corrections",
  "get_private_release_readiness","get_public_sold_out_catalog",
  "review_status='unverified'","admin_gate='clear'",
 ];
 for(const token of assertions)assert.ok(sql.includes(token),token);
 assert.match(sql,/Cross|unrelated supplier/i);
 assert.match(sql,/private_media_evidence_events/);
 assert.match(sql,/to_jsonb\(x\)/);
 assert.match(sql,/source approval, release or checkout state changed/);
 assert.doesNotMatch(sql,/set enabled=true|create_invoice|btcpay/i);
});
