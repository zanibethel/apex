import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planPrivateSharedImageCopy,copyPrivateImageBatch} from "../src/lib/catalog/bulk-shared-private-image.mjs";
const read=p=>readFileSync(p,"utf8");
const id=i=>"00000000-0000-4000-8000-"+i.toString(16).padStart(12,"0");

test("one image can be planned across all 63 private products without replacing existing media",()=>{
 const products=Array.from({length:63},(_,i)=>({productId:id(i+1),hasImage:i===0}));
 assert.equal(planPrivateSharedImageCopy(id(1),products).length,62);
 assert.deepEqual(planPrivateSharedImageCopy(id(1),products).slice(0,2),[id(2),id(3)]);
 assert.deepEqual(planPrivateSharedImageCopy(id(1),[{productId:id(2),hasImage:true}]),[]);
 assert.deepEqual(planPrivateSharedImageCopy("outside-store",products),[]);
 assert.equal(planPrivateSharedImageCopy(id(1),[...products,{productId:id(2),hasImage:false}]).length,62);
});

test("bulk copies the same authenticated source bytes once into individually authorized paths",async()=>{
 const ids=Array.from({length:62},(_,i)=>id(i+2));
 const downloadCalls=[],uploads=[],attached=[];
 const progress=[];
 const result=await copyPrivateImageBatch({
  ids,
  authorize:async target=>({
   ok:true,sourcePath:id(1)+"/private.png",path:"store/"+target+"/copy.png",
   token:"signed:"+target,mime:"image/png",
  }),
  download:async path=>{downloadCalls.push(path);return new Blob(["fake-image"],{type:"image/png"});},
  upload:async(path,token,blob,mime)=>{
   assert.equal(blob.size,10);assert.equal(mime,"image/png");
   assert.ok(token.startsWith("signed:"));uploads.push(path);
  },
  attach:async(id,path)=>{assert.ok(path.includes(id));attached.push(id);},
  onProgress:status=>progress.push(status),
  concurrency:3,
 });
 assert.equal(result.completed.length,62);
 assert.equal(result.failed.length,0);
 assert.equal(result.notAttempted.length,0);
 assert.equal(downloadCalls.length,1);
 assert.equal(new Set(uploads).size,62);
 assert.equal(new Set(attached).size,62);
 assert.equal(progress.at(-1).success,62);
});

test("failed private copy cannot be attached or counted as completed",async()=>{
 const attached=[];
 const result=await copyPrivateImageBatch({
  ids:[id(2),id(3),id(4)],
  authorize:async target=>({
   ok:true,sourcePath:"source/unchanged.png",path:"target/"+target+".png",
   token:"token",mime:"image/png",
  }),
  download:async()=>new Blob(["verified"],{type:"image/png"}),
  upload:async path=>{if(path.includes(id(3)))throw Error("Storage rejected upload");},
  attach:async id=>{attached.push(id);},
  concurrency:1,
 });
 assert.deepEqual(result.completed,[id(2),id(4)]);
 assert.deepEqual(result.failed.map(x=>x.id),[id(3)]);
 assert.deepEqual(attached,[id(2),id(4)]);
});

test("source replacement during the batch halts copying rather than mixing images",async()=>{
 const ids=[id(2),id(3),id(4)];
 const result=await copyPrivateImageBatch({
  ids,
  authorize:async target=>({ok:true,
   sourcePath:target===id(2)?"before.png":"after.png",
   path:target+".png",token:"token",mime:"image/png"}),
  download:async()=>new Blob(["image"],{type:"image/png"}),
  upload:async()=>{},
  attach:async()=>{},
  concurrency:1,
 });
 assert.deepEqual(result.completed,[id(2)]);
 assert.deepEqual(result.failed.map(x=>x.id),[id(3)]);
 assert.deepEqual(result.notAttempted,[id(4)]);
});

test("bulk UI only reuses existing authenticated signed-copy and attach actions",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const ui=read("src/app/supplier/catalog/shared-private-image-bulk-apply.tsx");
 const actions=read("src/app/supplier/catalog/image-actions.ts");
 assert.match(page,/SharedPrivateImageBulkApply/);
 assert.match(page,/sources=\{imageLibrary\}/);
 assert.match(ui,/requestProductImageReuse/);
 assert.match(ui,/attachProductImage/);
 assert.match(ui,/storage\.download\(path\)/);
 assert.match(ui,/uploadToSignedUrl\(path,token,blob/);
 assert.match(ui,/private placeholder only/);
 assert.match(ui,/No products were published or approved/);
 assert.match(actions,/sourceProductId===productId/);
 assert.match(actions,/\.eq\("store_id",storeId\)/);
 assert.match(actions,/\.eq\("is_published",false\)/);
 assert.match(actions,/createSignedUploadUrl\(path\)/);
 assert.match(actions,/image_path:path/);
 assert.doesNotMatch(ui,/service_role|createPublicUrl|\.update\(\{is_published|checkout|createInvoice/i);
});
