import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const integration=readFileSync("database/tests/supplier_hold_correction_roundtrip_integration.sql","utf8");
const workflow=readFileSync(".github/workflows/ci.yml","utf8");
const supplierEditor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const serverPage=readFileSync("src/app/supplier/catalog/bulk/page.tsx","utf8");
const adminActions=readFileSync("src/app/admin/listing-controls/actions.ts","utf8");

test("CI executes lifecycle against disposable Postgres after listing-control and release fixtures",()=>{
 const prior=workflow.indexOf("database/tests/private_release_decision_engine_integration.sql");
 const current=workflow.indexOf("database/tests/supplier_hold_correction_roundtrip_integration.sql");
 assert.ok(prior>=0&&current>prior);
 assert.match(integration,/NEVER run on hosted Supabase/);
 assert.match(integration,/set role authenticated/i);
});
test("supplier must see current scoped reason, correct private draft, and remain held",()=>{
 assert.match(integration,/QA: correct the private description/);
 assert.match(integration,/Supplier corrected description/);
 assert.match(integration,/Supplier content correction silently cleared admin hold/);
 assert.match(integration,/Supplier bypassed hold after correcting a draft/);
 assert.match(integration,/Cross-supplier hold reason leaked/);
 assert.match(integration,/Staff read a supplier hold reason/);
 assert.match(serverPage,/republish_approved,reason/);
 assert.match(serverPage,/reason:!listingError&&\["hold","review"\]/);
 assert.match(supplierEditor,/supplierAdminFeedback\(listingStatus\)/);
});
test("updated review reason and explicit admin approval are required before private re-request",()=>{
 assert.match(integration,/QA: confirm corrected description/);
 assert.match(integration,/Supplier bypassed required review before approval/);
 assert.match(integration,/Admin approval incorrectly resubmitted supplier preference/);
 assert.match(integration,/Corrected product could not be privately requested after admin approval/);
 assert.match(integration,/Admin review feedback audit history incomplete/);
 assert.match(integration,/effective_public/);
 assert.match(integration,/Private correction workflow activated public release/);
 assert.match(adminActions,/set_admin_listing_override/);
 assert.doesNotMatch(adminActions,/service_role|auth\.admin|publish_storefront/);
});
