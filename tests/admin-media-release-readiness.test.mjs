import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessAdminMediaRelease,MEDIA_RELEASE_CHECKS}
 from "../src/lib/catalog/admin-media-release-readiness.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const product="8c2c95c3-c43b-4286-a9fc-62cdb4d3aea3";
const path=`${store}/${product}/f1d8e128-5398-4e80-84c5-2f618cb72f59.png`;
const record={store_id:store,product_id:product,status:"approved_internal",
 snapshot:{name:"Synthetic private example",sku:"EXAMPLE",image_path:path}};
const checked=data=>data.checks.filter(c=>c.passed).map(c=>c.key);

test("admin media readiness shows private checks but never releases image or orders",()=>{
 const r=assessAdminMediaRelease(record,true);
 assert.equal(r.state,"private_review_only");
 assert.deepEqual(checked(r),[
  "review_submitted","private_image_attached","private_preview_accessible",
  "content_review_approved",
 ]);
 assert.equal(r.canDisplayPublicly,false);
 assert.equal(r.canCreateOrder,false);
 assert.equal(MEDIA_RELEASE_CHECKS.length,9);
 assert.ok(Object.isFrozen(r));
 assert.ok(r.checks.every(Object.isFrozen));
});

test("an internal review or a signed private image never implies independent media authorization",()=>{
 for(const status of ["approved_internal","pending_review","changes_requested"]){
  const r=assessAdminMediaRelease({...record,status},true);
  const missing=r.checks.filter(c=>!c.passed).map(c=>c.key);
  for(const key of [
   "current_version_confirmed","identity_verified","image_rights_verified",
   "product_release_authorized","public_asset_published",
  ])assert.ok(missing.includes(key),key);
  assert.equal(r.canDisplayPublicly,false);
  assert.equal(r.canCreateOrder,false);
 }
 const absent=assessAdminMediaRelease(record,false);
 assert.ok(!checked(absent).includes("private_preview_accessible"));
 const forgery=assessAdminMediaRelease({...record,snapshot:{
  image_path:`${store}/00000000-0000-4000-8000-000000000002/f1d8e128-5398-4e80-84c5-2f618cb72f59.png`,
 }},true);
 assert.ok(!checked(forgery).includes("private_image_attached"));
});

test("bad or missing review states fail closed without image disclosure",()=>{
 for(const value of [null,{},[],false,{
  ...record,store_id:"other",
 },{...record,status:"published"},{...record,snapshot:null}]){
  const r=assessAdminMediaRelease(value,true);
  assert.equal(r.state,"unavailable");
  assert.equal(r.canDisplayPublicly,false);
  assert.equal(r.canCreateOrder,false);
  assert.ok(r.checks.every(c=>c.passed===false));
 }
});

test("new admin page authenticates and uses existing private review RLS and signed previews",()=>{
 const page=readFileSync("src/app/admin/media-readiness/page.tsx","utf8");
 const dashboard=readFileSync("src/app/admin/page.tsx","utf8");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/\.auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(page,/from\("private_product_review_states"\)/);
 assert.match(page,/items|reviews/);
 assert.match(page,/count:"exact"/);
 assert.match(page,/reviews\.length!==count/);
 assert.match(page,/privateProductMediaPath\(/);
 assert.match(page,/createSignedUrl\(valid\.path,90\)/);
 assert.match(page,/assessAdminMediaRelease\(review,Boolean\(preview\)\)/);
 assert.match(page,/Nothing.*change|cannot change|This page cannot change/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.match(dashboard,/href: "\/admin\/media-readiness"/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|createPublicUrl|service_role|SUPABASE_SECRET|NEXT_PUBLIC_/);
 assert.doesNotMatch(page,/createInvoice|createOrder|paymentUrl|addToCart/);
});

test("current storefront requires independent release and does not consume admin-signed images",()=>{
 const publicFeed=readFileSync("src/lib/supabase/approved-sold-out-catalog.ts","utf8");
 const sql=readFileSync("database/sql/apex_public_sold_out_catalog_REVIEW_ONLY.sql","utf8");
 const admin=readFileSync("src/app/admin/media-readiness/page.tsx","utf8");
 assert.match(publicFeed,/APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled"/);
 assert.match(sql,/gate\.enabled=true/);
 assert.match(sql,/'can_checkout',false/);
 assert.doesNotMatch(admin,/getPublicUrl|storage\/v1\/object\/public/);
});
