import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(path,"utf8");

const actions=file("src/app/supplier/catalog/image-actions.ts");
const picker=file("src/app/supplier/catalog/image-uploader.tsx");
const page=file("src/app/supplier/catalog/page.tsx");
const css=file("src/app/globals.css");

test("same-store existing image selection requires server authorization and full IDs",()=>{
 assert.match(actions,/export async function requestProductImageReuse/);
 assert.match(actions,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(actions,/idRe\.test\(sourceProductId\)/);
 assert.match(actions,/productId===sourceProductId/);
 assert.match(actions,/const w=await scopedProduct\(storeId,productId\)/);
 assert.match(actions,/\.eq\("store_id",storeId\)/);
 assert.match(actions,/\.eq\("id",sourceProductId\)/);
 assert.match(actions,/\.eq\("is_published",false\)/);
 assert.match(actions,/sourcePath\.startsWith\(prefix\)/);
 assert.match(actions,/imageFileRe\.test\(sourcePath\.slice\(prefix\.length\)\)/);
 assert.match(actions,/createSignedUploadUrl\(path\)/);
 assert.match(actions,/randomUUID\(\)/);
 assert.doesNotMatch(actions,/service_role|auth\.admin|createPublicUrl|getPublicUrl|upsert:true/);
});

test("picker uses authenticated private read and destination signed upload",()=>{
 assert.match(picker,/requestProductImageReuse/);
 assert.match(picker,/\.download\(authorized\.sourcePath\)/);
 assert.match(picker,/\.uploadToSignedUrl\(/);
 assert.match(picker,/attachProductImage\(storeId,productId,authorized\.path\)/);
 assert.match(picker,/source\.size>3145728/);
 assert.match(picker,/upsert:false/);
 assert.match(picker,/existingImages\.some\(image=>image\.productId===sourceProductId\)/);
 assert.match(picker,/Upload new image/);
 assert.match(picker,/Choose existing image/);
 assert.match(picker,/No reusable images yet/);
 assert.match(picker,/separate private copy/);
 assert.match(picker,/aria-pressed=\{sourceProductId===image\.productId\}/);
 assert.doesNotMatch(picker,/deleteUser|service_role|\.remove\(|getPublicUrl/);
});

test("gallery is strictly same supplier store, private draft and not current product",()=>{
 assert.match(page,/source\.store_id===product\.store_id/);
 assert.match(page,/source\.id!==product\.id/);
 assert.match(page,/!source\.is_published/);
 assert.match(page,/Boolean\(source\.image_path\)/);
 assert.match(page,/images\.has\(source\.id\)/);
 assert.match(page,/const reusableImages=canWrite\?/);
 assert.match(page,/existingImages=\{reusableImages\}/);
 assert.match(page,/!product\.is_published && canWrite && <details/);
 assert.match(css,/\.apex-existing-image-grid/);
 assert.match(css,/\.apex-existing-image-option:focus-visible/);
 assert.doesNotMatch(page,/is_published:true|\.update\(\{is_published/);
});
