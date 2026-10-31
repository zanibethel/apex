import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isValidId,internalReviewLabel} from "../src/lib/catalog/private-review-utils.mjs";

const read=path=>readFileSync(path,"utf8");
const sql=read("database/sql/apex_private_product_review_REVIEW_ONLY.sql");
const supplier=read("src/app/supplier/catalog/review-actions.ts");
const admin=read("src/app/admin/product-reviews/actions.ts");
const catalog=read("src/app/supplier/catalog/page.tsx");
const queue=read("src/app/admin/product-reviews/page.tsx");
const ci=read(".github/workflows/ci.yml");

test("review labels separate submitted, changes and internal-only approval",()=>{
 assert.equal(internalReviewLabel("pending_review"),"Pending review");
 assert.equal(internalReviewLabel("changes_requested"),"Changes requested");
 assert.equal(internalReviewLabel("approved_internal"),"Approved internally");
 assert.equal(internalReviewLabel(null),"Not submitted");
 assert.equal(isValidId("00000000-0000-4000-8000-000000000001"),true);
 assert.equal(isValidId("00000000-0000-4000-8000-00000000000"),false);
});
test("table writes and platform-only decisions cannot be directly forged by authenticated users",()=>{
 assert.match(sql,/revoke all on public\.private_product_review_states,public\.private_product_review_history/);
 assert.match(sql,/grant select on public\.private_product_review_states,public\.private_product_review_history/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/auth\.jwt\(\)/);
 assert.match(sql,/is distinct from 'platform_admin'/);
 assert.match(sql,/security definer set search_path=pg_catalog/);
 assert.match(sql,/supplier_memberships m/);
 assert.match(sql,/m\.role in \('owner','manager'\)/);
 assert.match(sql,/v_saved\.submission_id is distinct from p_submission_id/);
 assert.match(sql,/v_current<>v_saved\.snapshot/);
 assert.match(sql,/p_decision='changes_requested' and v_note is null/);
 assert.match(sql,/private_product_review_history/);
 assert.doesNotMatch(sql,/set is_published|set is_public|grant update.*is_published/i);
});
test("server actions authenticate and persist only an internal status",()=>{
 assert.match(supplier,/getUser\(\)/);
 assert.match(supplier,/in\("role",\["owner","manager"\]\)/);
 assert.match(supplier,/submit_private_product_review/);
 assert.match(supplier,/Nothing was published/);
 assert.match(admin,/isVerifiedPlatformAdmin/);
 assert.match(admin,/decide_private_product_review/);
 assert.match(admin,/internal catalog review only/);
 assert.doesNotMatch(supplier+admin,/service_role|auth\.admin|publish_storefront|payment_intent/);
});
test("completed setup remains compact and can be submitted; review and public release distinct",()=>{
 assert.match(catalog,/8\/8 complete · View checks/);
 assert.match(catalog,/SupplierReviewSubmission/);
 assert.match(catalog,/Admin feedback/);
 assert.match(catalog,/reviewStatus==="changes_requested"/);
 assert.match(catalog,/reviewStatus==="pending_review"/);
 assert.match(catalog,/Public storefront: Not enabled/);
 assert.match(catalog,/Public release needs separately authorized product eligibility/);
 assert.match(queue,/isVerifiedPlatformAdmin/);
 assert.match(queue,/ProductReviewDecisionForm/);
 assert.match(queue,/Admin and product eligibility|not regulatory clearance/i);
 assert.match(ci,/private_product_review_integration\.sql/);
});
