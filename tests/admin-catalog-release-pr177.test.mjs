import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyAdminRelease,summarizeAdminRelease}
 from "../src/lib/catalog/admin-release-board.mjs";
import {privateReleaseDisplay}
 from "../src/lib/catalog/private-release-decision.mjs";

const read=path=>readFileSync(path,"utf8");
const complete=()=>({
 status_code:"public_visible",effective_public:true,
 checks:{supplier_requested:true,admin_clear:true,
  supplier_authorized:true,product_authorized:true,
  public_release_enabled:true,sold_out_inventory_valid:true,
  category_published:true,product_setup_complete:true,
  content_review_clear:true,same_supplier_identity_clear:true},
});
test("only a fully verified database verdict counts as visible Sold Out",()=>{
 const visible=classifyAdminRelease(complete());
 assert.equal(visible.visible,true);
 assert.match(visible.label,/Sold Out/);
 for(const key of Object.keys(complete().checks)){
  const verdict=complete();
  verdict.checks[key]=false;
  assert.equal(classifyAdminRelease(verdict).visible,false,key);
 }
 for(const invalid of [
  null,{},undefined,{status_code:"public_visible",effective_public:false},
  {status_code:"admin_hold",effective_public:true}, 
  {status_code:"public_visible",effective_public:true},
 ])
  assert.equal(classifyAdminRelease(invalid).visible,false);
 assert.equal(classifyAdminRelease(null).code,"unavailable");
 assert.equal(classifyAdminRelease({status_code:"public_visible",
  effective_public:false}).code,"inconsistent");
 assert.equal(privateReleaseDisplay(complete()).label,"Live · Sold Out");
 assert.equal(privateReleaseDisplay({status_code:"category_not_published",
  effective_public:false}).label,"Category not published");
});
test("release counts cannot use supplier intent as public approval",()=>{
 const rows=[
  {publishEnabled:true,decision:complete()},
  {publishEnabled:true,decision:{status_code:"admin_hold",effective_public:false}},
  {publishEnabled:false,decision:{status_code:"supplier_not_requested",effective_public:false}},
  {publishEnabled:true,decision:undefined},
 ];
 const summary=summarizeAdminRelease(rows);
 assert.deepEqual(summary,{total:4,visible:1,private:1,review:1,
  unavailable:1,publishOn:3});
 assert.equal(Object.isFrozen(summary),true);
});
test("admin release page revalidates identity and uses protected per-product RPC",()=>{
 const page=read("src/app/admin/catalog-release/page.tsx");
 const admin=read("src/app/admin/page.tsx");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(page,/from\("products"\)/);
 assert.match(page,/from\("supplier_listing_controls"\)/);
 assert.match(page,/from\("inventory_items"\)/);
 assert.match(page,/from\("categories"\)/);
 assert.match(page,/rpc\("get_private_release_readiness"/);
 assert.match(page,/RPC_CONCURRENCY=8/);
 assert.match(page,/classifyAdminRelease\(row\.decision\)/);
 assert.match(page,/PAGE_LIMIT=100/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.match(admin,/href: "\/admin\/catalog-release"/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|\.insert\(|\.upsert\(|\.update\(|\.delete\(|createInvoice|createPayout|process\.env\.[A-Z_]*KEY/);
});
test("review-only SQL keeps global gate off and reuses one release predicate",()=>{
 const sql=read("database/sql/apex_verified_soldout_release_activation_REVIEW_ONLY.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 const testSql=read("tests/payout-rls/verified-soldout-release-lifecycle.sql");
 assert.match(sql,/private_release_gate_enabled_check/);
 assert.match(sql,/drop constraint private_release_gate_enabled_check/);
 assert.match(sql,/is_soldout_release_eligible\(/);
 assert.match(sql,/security definer/);
 assert.match(sql,/v_visible:=apex_internal\.is_soldout_release_eligible/);
 assert.match(sql,/where apex_internal\.is_soldout_release_eligible\(p\.store_id,p\.id\)/);
 assert.match(sql,/i\.quantity_on_hand=0 and i\.quantity_reserved=0/);
 assert.match(sql,/sa\.reviewed_by is not null/);
 assert.match(sql,/pa\.reviewed_by is not null/);
 assert.match(sql,/cat\.is_published=true/);
 assert.match(sql,/supplier_wants_listing=true/);
 assert.match(sql,/admin_gate='clear'/);
 assert.match(sql,/'can_checkout',false/);
 assert.match(sql,/revoke all on function/);
 assert.match(sql,/enabled=false/);
 assert.doesNotMatch(sql,/update apex_internal\.private_release_gate\s+set enabled=true/i);
 assert.doesNotMatch(sql,/update public\.products|update public\.stores|update public\.inventory_items|create_invoice|checkout_session|createPublicUrl/i);
 assert.match(workflow,/verified-soldout-release-lifecycle\.sql/);
 assert.match(testSql,/Admin hold did not remove public listing/);
 assert.match(testSql,/Unpublish did not remove public listing/);
 assert.match(testSql,/Missing signed approval evidence/);
});
