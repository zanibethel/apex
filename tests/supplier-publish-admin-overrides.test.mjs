import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {listingControlStatus,listingControlAuditAction} from "../src/lib/catalog/listing-control.mjs";
const read=path=>readFileSync(path,"utf8");
const sql=read("database/sql/apex_supplier_publish_admin_override_REVIEW_ONLY.sql");
const supplier=read("src/app/supplier/catalog/page.tsx");
const actions=read("src/app/supplier/catalog/listing-actions.ts");
const admin=read("src/app/admin/listing-controls/page.tsx");
const adminActions=read("src/app/admin/listing-controls/actions.ts");
const integration=read("database/tests/supplier_listing_admin_override_integration.sql");
const ci=read(".github/workflows/ci.yml");

test("supplier wants listing never equals publicly available",()=>{
 assert.deepEqual(listingControlStatus(null),{label:"Not requested",kind:"private",canRequest:true});
 assert.equal(listingControlStatus({admin_gate:"clear",supplier_wants_listing:true}).kind,"requested");
 assert.match(listingControlStatus({admin_gate:"clear",supplier_wants_listing:true}).label,/not live/);
 assert.equal(listingControlStatus({admin_gate:"hold",supplier_wants_listing:true}).kind,"hold");
 assert.equal(listingControlStatus({admin_gate:"hold",supplier_wants_listing:true}).canRequest,false);
 assert.equal(listingControlStatus({admin_gate:"review_required",supplier_wants_listing:true}).canRequest,false);
 assert.equal(listingControlStatus({
  admin_gate:"clear",republish_approval_required:true,republish_approved:false,
 }).kind,"review");
 assert.equal(listingControlStatus({
  admin_gate:"clear",republish_approval_required:false,republish_approved:true,
 }).canRequest,true);
});
test("listing audit labels describe supplier and administrator actions",()=>{
 assert.match(listingControlAuditAction("publish_requested"),/Supplier/);
 assert.match(listingControlAuditAction("unpublish_requested"),/Supplier/);
 assert.match(listingControlAuditAction("admin_hold"),/Administrator/);
 assert.match(listingControlAuditAction("admin_review_required"),/Administrator/);
 assert.match(listingControlAuditAction("admin_republish_approved"),/Administrator/);
});
test("RPCs check owner/manager and admin app metadata and block publication under hold",()=>{
 assert.match(sql,/set_supplier_listing_intent/);
 assert.match(sql,/set_admin_listing_override/);
 assert.match(sql,/m\.role in \('owner','manager'\)/);
 assert.match(sql,/p_action is null/);
 assert.match(sql,/apex_internal\.private_product_review_snapshot/);
 assert.match(sql,/v_state\.admin_gate<>'clear'/);
 assert.match(sql,/v_state\.republish_approval_required and not v_state\.republish_approved/);
 assert.match(sql,/supplier_wants_listing=false/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/is distinct from 'platform_admin'/);
 assert.match(sql,/security definer set search_path=pg_catalog/);
 assert.match(sql,/revoke all on public\.supplier_listing_controls,public\.supplier_listing_events/);
 assert.match(sql,/for select to authenticated/);
 assert.match(sql,/create table public\.supplier_listing_events/);
 assert.match(sql,/create trigger apex_private_review_product_change_guard/);
 assert.match(sql,/drop trigger apex_private_review_inventory_change_guard/);
 assert.doesNotMatch(sql,/update public\.products set is_published|update public\.stores set is_public|grant update \(is_published/);
});
test("supplier publication control stays private and admin controls cannot bypass role verification",()=>{
 assert.match(supplier,/SupplierListingControls/);
 assert.match(supplier,/Public storefront: Not enabled/);
 assert.match(supplier,/listingControlStatus/);
 assert.match(actions,/getUser\(\)/);
 assert.match(actions,/set_supplier_listing_intent/);
 assert.match(adminActions,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(adminActions,/set_admin_listing_override/);
 assert.match(admin,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(admin,/AdminListingOverrideForm/);
 assert.match(admin,/No listing is publicly visible/);
 assert.doesNotMatch(supplier+actions+adminActions,/service_role|auth\.admin|createPublicUrl/);
});
test("CI denies cross-store/staff and tests admin hold/release after supplier preference",()=>{
 assert.match(ci,/supplier_listing_admin_override_integration.sql/);
 assert.match(integration,/Cross supplier publish request accepted/);
 assert.match(integration,/Supplier created an admin hold/);
 assert.match(integration,/Supplier bypassed admin hold/);
 assert.match(integration,/Staff requested listing/);
 assert.match(integration,/Admin reapproval incorrectly published automatically/);
 assert.match(integration,/Routine price\/stock edits unnecessarily invalidate review/);
 assert.match(integration,/Material description edit failed to invalidate approval/);
 assert.match(integration,/Private supplier publishing changed public visibility/);
});
