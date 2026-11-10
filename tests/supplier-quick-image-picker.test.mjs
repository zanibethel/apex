import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(path,"utf8");
const editor=file("src/app/supplier/catalog/bulk-editor.tsx");
const picker=file("src/app/supplier/catalog/quick-image-picker.tsx");
const uploader=file("src/app/supplier/catalog/image-uploader.tsx");
const css=file("src/app/supplier/catalog/bulk/quick-image-picker.css");

test("image tile offers a distinct quick picker without opening the full editor",()=>{
 assert.match(editor,/QuickProductImagePicker/);
 assert.match(editor,/imageUrl=\{cardMedia\?\.imageUrl\}/);
 assert.match(editor,/needsSave=\{!r\.id\|\|Boolean\(r\.needsSave\)\}/);
 assert.match(editor,/onClick=\{\(\)=>toggleEdit\(r\.key\)\}/);
 assert.match(picker,/aria-haspopup="dialog"/);
 assert.match(picker,/aria-expanded=\{open\}/);
 assert.match(picker,/onClick=\{\(\)=>setOpen\(true\)\}/);
 assert.doesNotMatch(picker,/toggleEdit|setEditOpenKeys|saveBulkProductDrafts/);
});
test("quick picker uses existing authenticated upload and same-store image reuse",()=>{
 assert.match(picker,/ProductImageUploader/);
 assert.match(picker,/existingImages=\{existingImages\.filter\(image=>image\.productId!==productId\)\}/);
 assert.match(picker,/Save this product and any unsaved edits first/);
 assert.match(uploader,/requestProductImageUpload/);
 assert.match(uploader,/requestProductImageReuse/);
 assert.match(uploader,/attachProductImage/);
 assert.match(uploader,/onSaved\?\.\(\)/);
 assert.doesNotMatch(picker,/service_role|createPublicUrl|is_published:true|uploadToSignedUrl/);
});
test("quick picker is accessible and compact on iPhone without blocking page navigation",()=>{
 assert.match(picker,/aria-modal="true"/);
 assert.match(picker,/role="dialog"/);
 assert.match(picker,/e\.key==="Escape"/);
 assert.match(picker,/e\.key!=="Tab"/);
 assert.match(picker,/document\.body\.style\.overflow/);
 assert.match(picker,/trigger\.current\?\.focus\(\)/);
 assert.match(css,/\.apex-quick-image-backdrop/);
 assert.match(css,/max-height:calc\(100dvh - 32px\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\.apex-quick-image-trigger:focus-visible/);
});
