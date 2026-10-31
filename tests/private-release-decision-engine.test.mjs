import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateReleaseDisplay} from "../src/lib/catalog/private-release-decision.mjs";

const read=path=>readFileSync(path,"utf8");
const sql=read("database/sql/apex_private_release_decision_engine_REVIEW_ONLY.sql");
const fixture=read("database/tests/private_release_decision_engine_integration.sql");
const supplier=read("src/app/supplier/catalog/page.tsx");
const admin=read("src/app/admin/listing-controls/page.tsx");
const workflow=read(".github/workflows/ci.yml");

test("release display is fail closed and does not call intent a public listing",()=>{
 assert.equal(privateReleaseDisplay(null).label,"Decision unavailable");
 assert.equal(privateReleaseDisplay({status_code:"public_release_disabled",effective_public:true}).label,"Decision unavailable");
 assert.equal(privateReleaseDisplay({status_code:"public_release_disabled",effective_public:false}).label,"Public release disabled");
 assert.equal(privateReleaseDisplay({status_code:"admin_hold",effective_public:false}).label,"Administrative hold");
 assert.equal(privateReleaseDisplay({status_code:"same_supplier_identity_hold",effective_public:false}).label,"Matching listing held");
 assert.equal(privateReleaseDisplay({status_code:"supplier_authorization_unverified",effective_public:false}).label,"Supplier authorization not verified");
 assert.equal(privateReleaseDisplay({status_code:"product_authorization_blocked",effective_public:false}).label,"Product authorization blocked");
 assert.equal(privateReleaseDisplay({status_code:"invented",effective_public:false}).label,"Unknown restriction");
});
test("engine cannot publish and defaults seller and product verification to unverified",()=>{
 assert.match(sql,/check\(enabled=false\)/);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/status text not null default 'unverified'/);
 assert.match(sql,/supplier_release_authorizations/);
 assert.match(sql,/product_release_authorizations/);
 assert.match(sql,/effective_public',false/);
 assert.match(sql,/public_release_enabled',false/);
 assert.match(sql,/get_private_release_readiness/);
 assert.match(sql,/set search_path=pg_catalog/);
 assert.match(sql,/v_actor is null/);
 assert.match(sql,/m\.role in\('owner','manager'\)/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/revoke all on function public\.get_private_release_readiness\(uuid,uuid\)/);
 assert.doesNotMatch(sql,/update public\.products set is_published|update public\.stores set is_public|grant update .*is_published|create policy .* to anon/i);
});
test("admin holds block cloned SKUs and clear previously saved requests",()=>{
 assert.match(sql,/create table apex_internal\.listing_identity_holds/);
 assert.match(sql,/h\.supplier_id=s\.supplier_id/);
 assert.match(sql,/listing_signature\(new\.product_name\)/);
 assert.match(sql,/when\(old\.admin_gate is distinct from new\.admin_gate\)/);
 assert.match(sql,/supplier_wants_listing=false/);
 assert.match(sql,/before insert or update of supplier_wants_listing/);
 assert.match(sql,/reject_duplicate_held_request/);
 assert.match(fixture,/Cloned listing bypassed held identity/);
 assert.match(fixture,/Admin hold did not clear duplicate publication preference/);
 assert.match(fixture,/Admin release automatically restored duplicate preference/);
});
test("CI validates authorization expiry and never exposes the private product",()=>{
 assert.match(fixture,/Missing supplier authorization was not fail-closed/);
 assert.match(fixture,/Expired product authorization not blocked/);
 assert.match(fixture,/Explicitly blocked product authorization ignored/);
 assert.match(fixture,/Fully qualified private request must remain unreleased/);
 assert.match(fixture,/Unrelated supplier read private release eligibility/);
 assert.match(fixture,/Private decision engine published a product\/store/);
 assert.match(workflow,/private_release_decision_engine_integration\.sql/);
});
test("supplier and admin show actual database decision, not guessed publication",()=>{
 assert.match(supplier,/rpc\("get_private_release_readiness"/);
 assert.match(admin,/rpc\("get_private_release_readiness"/);
 assert.match(supplier,/privateReleaseDisplay\(releaseDecisions.get\(product.id\)\)/);
 assert.match(admin,/privateReleaseDisplay\(releaseDecisions.get\(item.store_id\+":"\+item.product_id\)\)/);
 assert.match(supplier,/if\(!error&&data\)releaseDecisions.set/);
 assert.match(admin,/if\(!readinessError&&data\)/);
 assert.match(supplier,/Effective release decision:/);
 assert.match(admin,/Effective release decision:/);
 assert.doesNotMatch(supplier+admin,/createPublicUrl|service_role|\.update\(\{is_published:true/);
});
