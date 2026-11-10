import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierStorefrontVisibility} from "../src/lib/catalog/supplier-storefront-visibility.mjs";
const read=path=>readFileSync(path,"utf8");
const positive=()=>({
 status_code:"public_visible",effective_public:true,
 checks:{supplier_requested:true,admin_clear:true,
  supplier_authorized:true,product_authorized:true,
  public_release_enabled:true,same_supplier_identity_clear:true,
  content_review_clear:true,product_setup_complete:true,
  category_published:true,sold_out_inventory_valid:true},
});
const control={available:true,requested:true,adminGate:"clear",
 republishApprovalRequired:false,republishApproved:false};

test("requesting publication never means a product is live",()=>{
 const requested=supplierStorefrontVisibility(control,{
  status_code:"public_release_disabled",effective_public:false,
  checks:{supplier_requested:true,public_release_enabled:false},
 });
 assert.equal(requested.kind,"requested");
 assert.match(requested.label,/not visible/i);
 assert.equal(requested.publiclyVisible,false);
 assert.match(requested.description,/switched off/);
 assert.equal(supplierStorefrontVisibility({...control,requested:false},positive()).kind,"private");
 assert.equal(supplierStorefrontVisibility({...control,requested:false},positive(),true).publiclyVisible,false);
 assert.equal(supplierStorefrontVisibility(control,null).kind,"unavailable");
 assert.equal(supplierStorefrontVisibility({...control,available:false},positive()).kind,"unavailable");
});

test("admin hold and review restrictions supersede even a positive release claim",()=>{
 const held=supplierStorefrontVisibility({...control,adminGate:"hold"},positive());
 assert.equal(held.kind,"held");
 assert.equal(held.publiclyVisible,false);
 const review=supplierStorefrontVisibility({...control,adminGate:"review_required"},positive());
 assert.equal(review.kind,"held");
 const republish=supplierStorefrontVisibility({...control,republishApprovalRequired:true,republishApproved:false},positive());
 assert.equal(republish.kind,"held");
});

test("only an explicit fully verified server release can ever display Live",()=>{
 const live=supplierStorefrontVisibility(control,positive());
 assert.equal(live.kind,"live");
 assert.equal(live.publiclyVisible,true);
 for(const field of Object.keys(positive().checks)){
  const verdict=positive();
  verdict.checks[field]=false;
  const state=supplierStorefrontVisibility(control,verdict);
  assert.equal(state.publiclyVisible,false,field);
  assert.equal(state.kind,"unavailable",field);
 }
 assert.equal(supplierStorefrontVisibility(control,{
  ...positive(),status_code:"public_release_disabled",
 }).publiclyVisible,false);
 assert.equal(supplierStorefrontVisibility(control,{
  ...positive(),effective_public:false,
 }).publiclyVisible,false);
 assert.equal(supplierStorefrontVisibility(control,{
  ...positive(),status_code:"admin_hold",
 }).publiclyVisible,false);
});

test("zero-stock display has no implied checkout right",()=>{
 const state=supplierStorefrontVisibility(control,{
  status_code:"insufficient_available_stock",effective_public:false,
  checks:{supplier_requested:true},
 });
 assert.equal(state.kind,"requested");
 assert.match(state.description,/Sold Out/);
 assert.match(state.description,/checkout stays disabled/);
});

test("main product cards fetch protected release status, and cannot mark Live locally",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 const helper=read("src/lib/catalog/supplier-storefront-visibility.mjs");
 assert.match(page,/get_private_release_readiness/);
 assert.match(page,/listingByProduct\.get\(p\.id\)\?\.supplier_wants_listing===true/);
 assert.match(page,/if\(!error&&data\)releases\.set\(p\.id,data\)/);
 assert.match(page,/supplierStorefrontVisibility/);
 assert.match(page,/visibilityKind:isRetail\?"retail-showcase":visibility\.kind/);
 assert.match(page,/visibilityDescription:isRetail/);
 assert.match(editor,/Storefront: \{visibilityLabel\}/);
 assert.match(editor,/visibilityKind/);
 assert.match(editor,/locallyChanged/);
 assert.match(editor,/Not visible/);
 assert.match(editor,/role="switch"/);
 assert.match(editor,/onChange=\{e=>attemptCardPublish\(r,listingStatus,publishReady,e\.target\.checked\)\}/);
 assert.match(helper,/releaseDecision\.status_code==="public_visible"/);
 assert.match(helper,/releaseDecision\.effective_public===true/);
 assert.doesNotMatch(helper,/localStorage|window\.|document\.|service_role|createSignedUrl|can_checkout=true/i);
});

test("single and bulk private previews also display protected storefront state",()=>{
 const single=read("src/app/supplier/catalog/preview/[productId]/page.tsx");
 const bulk=read("src/app/supplier/catalog/bulk/preview/page.tsx");
 for(const page of [single,bulk]){
  assert.match(page,/supplierStorefrontVisibility/);
  assert.match(page,/Storefront: \{/);
  assert.doesNotMatch(page,/is_published:\s*true|publicGalleryUrl|createPublicUrl/);
 }
 const sql=read("database/sql/apex_verified_only_sold_out_feed_REVIEW_ONLY.sql");
 assert.match(sql,/enabled=true/);
 assert.match(sql,/sa.status='verified'/);
 assert.match(sql,/pa.status='verified'/);
});
