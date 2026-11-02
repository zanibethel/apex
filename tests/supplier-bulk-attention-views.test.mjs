import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BULK_VIEW_FILTERS,filterSupplierBulkRows,
 supplierBulkNeedsAttention,supplierBulkWorkspaceSummary}
 from "../src/lib/catalog/bulk-workspace-filter.mjs";
const read=path=>readFileSync(path,"utf8");
const rows=[
 {id:"a",key:"a",name:"Requested and admin held",sku:"AAA",needsSave:false},
 {id:"b",key:"b",name:"Requested clear",sku:"BBB",needsSave:false},
 {id:"c",key:"c",name:"Needs image replacement",sku:"CCC",needsSave:false},
 {id:"d",key:"d",name:"Awaiting review",sku:"DDD",needsSave:false},
 {id:"e",key:"e",name:"Ready to request",sku:"EEE",needsSave:false},
 {id:"f",key:"f",name:"Incomplete setup",sku:"FFF",needsSave:false},
 {id:"g",key:"g",name:"Unsaved edits",sku:"GGG",needsSave:true},
 {key:"new",name:"Unsaved new card",sku:"",needsSave:true},
];
const listing=[
 {productId:"a",kind:"hold",visibilityKind:"held",requested:true,hasImage:true,canRequest:false},
 {productId:"b",kind:"requested",visibilityKind:"requested",requested:true,hasImage:true,canRequest:false},
 {productId:"c",kind:"ready",visibilityKind:"private",requested:false,hasImage:true,
   imageStatusKind:"correction",canRequest:true},
 {productId:"d",kind:"setup",visibilityKind:"private",requested:false,hasImage:true,
   reviewStatus:"pending_review",canRequest:false},
 {productId:"e",kind:"ready",visibilityKind:"private",requested:false,hasImage:true,canRequest:true},
 {productId:"f",kind:"setup",visibilityKind:"private",requested:false,hasImage:false,canRequest:false},
 {productId:"g",kind:"setup",visibilityKind:"private",requested:false,hasImage:false,canRequest:false},
];
const ids=(filter)=>filterSupplierBulkRows(rows,"",filter,listing).map(r=>r.key);
test("requested product under admin hold cannot disappear from attention and hold views",()=>{
 assert.ok(ids("requested").includes("a"));
 assert.ok(ids("needs_attention").includes("a"));
 assert.ok(ids("admin_holds").includes("a"));
 assert.ok(!ids("ready").includes("a"));
 assert.ok(!ids("needs_attention").includes("b"));
 assert.equal(supplierBulkNeedsAttention(rows[0],listing[0],true),true);
});
test("image corrections, missing images and review wait are independently filterable",()=>{
 assert.deepEqual(ids("image_fixes"),["c","f","g"]);
 assert.deepEqual(ids("review_pending"),["d"]);
 assert.deepEqual(ids("ready"),["c","e"]);
 assert.deepEqual(ids("unsaved"),["g","new"]);
 assert.deepEqual(ids("requested"),["a","b"]);
 assert.ok(BULK_VIEW_FILTERS.includes("image_fixes"));
 assert.ok(BULK_VIEW_FILTERS.includes("admin_holds"));
 assert.ok(BULK_VIEW_FILTERS.includes("review_pending"));
});
test("search and selected view do not change persistence or remove admin holds",()=>{
 assert.deepEqual(
  filterSupplierBulkRows(rows,"AAA","admin_holds",listing).map(r=>r.key),["a"]);
 assert.deepEqual(filterSupplierBulkRows(rows,"DDD","review_pending",listing).map(r=>r.key),["d"]);
 assert.deepEqual(filterSupplierBulkRows(rows,"zzz","all",listing),[]);
 assert.deepEqual(ids("typo-unknown-filter"),rows.map(r=>r.key));
 const nextReq=new Set(["e"]);
 assert.ok(filterSupplierBulkRows(rows,"","requested",listing,nextReq)
  .some(row=>row.key==="e"));
 assert.ok(!filterSupplierBulkRows(rows,"","ready",listing,nextReq)
  .some(row=>row.key==="e"));
});
test("private catalog overview uses verified metadata, not signed preview or public publication",()=>{
 const summary=supplierBulkWorkspaceSummary(rows,listing);
 assert.deepEqual(summary,{
  total:8,privateSaved:7,imagesAttached:5,imageFixes:3,adminHolds:1,
  reviewPending:1,publishRequested:2,needsAttention:4,unsaved:2,
 });
 assert.ok(Object.isFrozen(summary));
 assert.equal(supplierBulkWorkspaceSummary([],[]).imagesAttached,0);
});
test("supplier interface exposes counts and all actionable views without moving card controls",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const ui=read("src/app/supplier/catalog/bulk-editor.tsx");
 const helper=read("src/lib/catalog/bulk-workspace-filter.mjs");
 assert.match(page,/hasImage:Boolean\(p.image_path\)/);
 assert.match(ui,/supplierBulkWorkspaceSummary\(rows,effectiveListing\)/);
 assert.match(ui,/apex-bulk-workspace-summary/);
 for(const kind of ["image_fixes","admin_holds","review_pending","needs_attention"])
  assert.match(ui,new RegExp('value="'+kind+'"'));
 assert.match(ui,/apex-bulk-card-pencil/);
 assert.match(ui,/role="switch"/);
 assert.match(ui,/Storefront: \{visibilityLabel\}/);
 assert.match(helper,/if\(adminHold\(status\)\|\|imageFix\(status\)\)return true/);
 assert.doesNotMatch(helper,/\.update\(|is_published\s*=|createSignedUrl\(|checkout/);
});
