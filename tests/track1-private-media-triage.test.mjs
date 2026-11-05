import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyPrivateMediaQueue,sortPrivateMediaQueue,
 privateMediaQueueFilter,privateMediaQueueSummary,PRIVATE_MEDIA_QUEUE_FILTERS}
 from "../src/lib/catalog/private-media-triage.mjs";

const product={id:"8c2c95c3-c43b-4286-a9fc-62cdb4d3aea3",
 sku:"1001",name:"Synthetic product",category_id:"63000000-0000-0000-0000-000000000001"};
const held={...product,id:"18f203eb-d404-455d-b86a-2069174547c3",
 sku:"SYNTH-HOLD",name:"Synthetic identity hold",category_id:null};
const proposal={id:held.id,sku:held.sku,name:held.name,
 category:null,status:"Review identity"};
const media={privateImagePresent:true,internalContentReviewCurrent:false};
const reviewed={privateImagePresent:true,internalContentReviewCurrent:true};

function classify(p=product,r=media,status="draft",taxonomy=null,setup=true){
 return classifyPrivateMediaQueue(p,r,status,taxonomy,setup);
}
test("exact reviewed identity holds outrank media presence and never submit automatically",()=>{
 const hold=classify(held,reviewed,"draft",proposal,true);
 assert.equal(hold.kind,"identity_hold");
 assert.equal(hold.needsAction,true);
 assert.equal(hold.canRequestInternalReview,false);
 assert.equal(hold.publicMediaApproved,false);
 assert.equal(hold.canDisplayPublicly,false);
 assert.equal(hold.canCreateOrder,false);
 assert.ok(Object.isFrozen(hold));
 for(const changed of [{...proposal,id:product.id},{...proposal,sku:"other"},{...proposal,name:"Other"}]){
  assert.equal(classify(held,reviewed,"draft",changed,true).kind,"category_work");
 }
});
test("review requests require a real image, a category and a complete private setup",()=>{
 assert.equal(classify().kind,"ready_to_request");
 assert.equal(classify().canRequestInternalReview,true);
 assert.equal(classify(product,media,"draft",null,false).kind,"metadata_work");
 assert.equal(classify(product,{privateImagePresent:false},"draft").kind,"image_work");
 assert.equal(classify({...product,category_id:null}).kind,"category_work");
 assert.equal(classify(product,media,"pending_review").kind,"under_review");
 assert.equal(classify(product,media,"changes_requested").kind,"corrections");
 assert.equal(classify(product,reviewed,"approved_internal").kind,"content_reviewed");
 assert.equal(classify(product,media,"approved_internal").kind,"stale_review");
 assert.equal(classify(product,media,"invented").kind,"unavailable");
 assert.equal(classify(product,null,"draft").kind,"unavailable");
 assert.equal(classify(product,media,"pending_review").canRequestInternalReview,false);
 assert.equal(classify(product,media,"approved_internal").canRequestInternalReview,false);
});

test("page-local supplier queue prioritizes held IDs and never promotes private content",()=>{
 const rows=[
  {product:{...product,name:"Zulu"},triage:classify(product,reviewed,"approved_internal")},
  {product:held,triage:classify(held,media,"draft",proposal)},
  {product:{...product,name:"Bravo"},triage:classify(product,media,"draft")},
  {product:{...product,name:"Alpha"},triage:classify(product,media,"pending_review")},
 ];
 assert.deepEqual(sortPrivateMediaQueue(rows).map(x=>x.product.name),[
  "Synthetic identity hold","Bravo","Alpha","Zulu",
 ]);
 assert.equal(privateMediaQueueFilter(rows,"all").length,4);
 assert.deepEqual(privateMediaQueueFilter(rows,"held").map(x=>x.product.name),
  ["Synthetic identity hold"]);
 assert.deepEqual(privateMediaQueueFilter(rows,"action").map(x=>x.product.name),
  ["Synthetic identity hold","Bravo"]);
 assert.deepEqual(privateMediaQueueFilter(rows,"complete").map(x=>x.product.name),
  ["Zulu"]);
 assert.deepEqual(privateMediaQueueFilter(rows,"review").map(x=>x.product.name),
  ["Bravo","Alpha"]);
 assert.deepEqual(privateMediaQueueFilter(rows,"mystery"),[]);
 assert.deepEqual(PRIVATE_MEDIA_QUEUE_FILTERS,["all","action","held","image","review","complete"]);
 assert.deepEqual(privateMediaQueueSummary(rows),{
  total:4,action:2,identityHolds:1,imageWork:0,
  readyToRequest:1,underReview:1,reviewed:1,publicMediaApproved:0,
 });
});

test("supplier-only queue keeps all data scoped, avoids truncated reads and bounds storage",()=>{
 const page=readFileSync("src/app/supplier/catalog/media-readiness/page.tsx","utf8");
 const action=readFileSync("src/app/supplier/catalog/review-actions.ts","utf8");
 const layout=readFileSync("src/app/supplier/catalog/media-readiness/media-readiness.css","utf8");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/stores\.length!==1/);
 assert.match(page,/reviews\.count!==reviews\.data\?\.length/);
 assert.match(page,/inventory\.count!==inventory\.data\?\.length/);
 assert.match(page,/const SIGN_BATCH=8/);
 assert.match(page,/for\(let start=0;start<\(items\.data\?\?\[\]\)\.length;start\+=SIGN_BATCH\)/);
 assert.match(page,/privateProductMediaPath\(store\.id,product\.id,product\.image_path\)/);
 assert.match(page,/\.createSignedUrl\(validated\.path,120\)/);
 assert.match(page,/classifyPrivateMediaQueue/);
 assert.match(page,/taxonomyMap\.get\(row\.product\.id\)/);
 assert.match(page,/triage\.canRequestInternalReview/);
 assert.match(page,/SupplierReviewSubmission/);
 assert.match(action,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(action,/\.rpc\("submit_private_product_review"/);
 assert.match(layout,/\.apex-media-filters/);
 assert.match(page,/Nothing here changes publication or starts checkout/);
 assert.doesNotMatch(page,/createPublicUrl|service_role|NEXT_PUBLIC_SUPABASE_SECRET|\.insert\(|\.update\(|\.delete\(/);
});
