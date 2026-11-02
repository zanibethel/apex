import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessPrivateMediaReadiness,privateProductMediaPath}
 from "../src/lib/catalog/private-media-readiness.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const product="8c2c95c3-c43b-4286-a9fc-62cdb4d3aea3";
const file="f1d8e128-5398-4e80-84c5-2f618cb72f59.png";
const path=`${store}/${product}/${file}`;
const read=path=>readFileSync(path,"utf8");

test("private image verification only accepts the exact store/product path",()=>{
 assert.deepEqual(privateProductMediaPath(store,product,path),{
  folder:`${store}/${product}`,file,path,
 });
 for(const bad of [
  null,undefined,"",`${store}/other/${file}`,
  `${store}/${product}/../${file}`,
  `other/${product}/${file}`,
  `${store}/${product}/file.svg`,
  `${store}/${product}/../../evil.png`,
  `${store}/${product}/file.png?token=x`,
  `${store}/${product}/random name.png`,
 ])assert.equal(privateProductMediaPath(store,product,bad),null);
 assert.equal(privateProductMediaPath("invalid",product,path),null);
 assert.equal(privateProductMediaPath(store,"invalid",path),null);
});
test("private image presence is observational and cannot grant public image or purchasing rights",()=>{
 const a=assessPrivateMediaReadiness({
  pathValid:true,objectFound:true,signedPreview:true,
  reviewStatus:"approved_internal",snapshotImagePath:path,currentImagePath:path,
 });
 assert.equal(a.status,"stored_privately");
 assert.equal(a.privateImagePresent,true);
 assert.equal(a.internalContentReviewCurrent,true);
 assert.equal(a.productSpecificIdentityVerified,false);
 assert.equal(a.publicMediaApproved,false);
 assert.equal(a.canDisplayPublicly,false);
 assert.equal(a.canCreateOrder,false);
 assert.ok(Object.isFrozen(a));
 for(const b of [
  {},
  {pathValid:true},
  {pathValid:true,objectFound:false},
  {pathValid:true,objectFound:true,signedPreview:false},
  {pathValid:true,objectFound:true,signedPreview:true,
   reviewStatus:"approved_internal",snapshotImagePath:"older-image",currentImagePath:path},
  {pathValid:true,objectFound:true,signedPreview:true,
   reviewStatus:"pending_review",snapshotImagePath:path,currentImagePath:path},
  {pathValid:false,currentImagePath:"wrong/path"},
 ]){
  const r=assessPrivateMediaReadiness(b);
  assert.equal(r.internalContentReviewCurrent,false);
  assert.equal(r.publicMediaApproved,false);
  assert.equal(r.canDisplayPublicly,false);
  assert.equal(r.canCreateOrder,false);
 }
});
test("supplier image queue protects private files, enforces membership and never writes",()=>{
 const page=read("src/app/supplier/catalog/media-readiness/page.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/redirect\("\/supplier\/sign-in"\)/);
 assert.match(page,/!s\.is_public/);
 assert.match(page,/\["owner","manager"\]\.includes\(m\.role\)/);
 assert.match(page,/stores\.length!==1/);
 assert.match(page,/\.eq\("store_id",store\.id\)\.eq\("is_published",false\)/);
 assert.match(page,/items\.count!==items\.data\?\.length/);
 assert.match(page,/privateProductMediaPath\(store\.id,product\.id,product\.image_path\)/);
 assert.match(page,/\.from\("apex-draft-product-images"\)\.list\(validated\.folder/);
 assert.match(page,/objects\?\.some\(item=>item\.name===validated\.file\)/);
 assert.match(page,/\.createSignedUrl\(validated\.path,120\)/);
 assert.match(page,/snapshotImagePath===currentImagePath|snapshotImagePath,currentImagePath/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|\.upload\(|createPublicUrl|service_role|NEXT_PUBLIC_SUPABASE_SECRET/);
 assert.match(page,/productSpecificIdentityVerified|product.*identity|Confirm the exact pictured product/);
 assert.match(page,/public.*image|public.*media/i);
 assert.match(page,/Nothing here changes publication/);
 assert.match(page,/storage/);
});
test("private image queue linked from supplier dashboard and bulk workflows",()=>{
 const page=read("src/app/supplier/catalog/media-readiness/page.tsx");
 const home=read("src/app/supplier/page.tsx");
 const bulk=read("src/app/supplier/catalog/bulk/page.tsx");
 const drafts=read("src/app/supplier/imports/bulk-drafts/page.tsx");
 const admin=read("src/app/admin/product-reviews/page.tsx");
 for(const c of [home,bulk,drafts])
  assert.match(c,/href="\/supplier\/catalog\/media-readiness"/);
 assert.match(page,/href=\{"\/supplier\/catalog#image-"\+product\.id\}/);
 assert.match(page,/href=\{"\/supplier\/catalog\/preview\/"\+product\.id\}/);
 assert.match(admin,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(admin,/private_product_review_states/);
 assert.match(admin,/createSignedUrl\(path,90\)/);
});
