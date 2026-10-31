import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {draftContentChecklist} from "../src/lib/catalog/draft-content-checklist.mjs";

const read = path => readFileSync(path,"utf8");
const page=read("src/app/supplier/catalog/page.tsx");
const css=read("src/app/globals.css");

const basic={
 name:"Internal fixture",sku:"APX-INTERNAL-001",description:"Supplier-only draft details",
 category_id:"00000000-0000-4000-8000-000000000003",
 image_path:"fixture/private.png",price_cents:999,
};

test("content checklist is deterministic and never determines publication",()=>{
  const full=draftContentChecklist({...basic,is_published:false,is_active:false});
  assert.deepEqual(full,{completed:6,total:6,missing:[],contentComplete:true});
  // A complete private draft remains private: the helper returns no publish action.
  assert.equal(Object.hasOwn(full,"is_published"),false);
  const missing=draftContentChecklist({
    ...basic,description:"",category_id:null,image_path:null,price_cents:0,
  });
  assert.deepEqual(missing,{
    completed:2,total:6,
    missing:["Description","Category","Image","Price"],
    contentComplete:false,
  });
});
test("checklist does not mistake whitespace, unknown inventory, or inactive status for approval",()=>{
 const missing=draftContentChecklist({
  ...basic,name:"  ",sku:"",description:" ",category_id:null,
  image_path:"",price_cents:NaN,is_active:true,is_published:true,
 });
 assert.equal(missing.completed,0);
 assert.equal(missing.total,6);
 assert.equal(missing.missing.length,6);
 const unchanged=draftContentChecklist({...basic,quantity_on_hand:0});
 assert.equal(unchanged.contentComplete,true);
 const source=read("src/lib/catalog/draft-content-checklist.mjs");
 assert.doesNotMatch(source,/\\.update\\(|\\.insert\\(|service_role|is_published\s*:/);
});
test("mobile cards always show image and summary, then collapse long edit controls",()=>{
 assert.match(page,/apex-product-photo/);
 assert.match(page,/SKU: \{product.sku\}/);
 assert.match(page,/Purchase price/);
 assert.match(page,/Inventory:/);
 assert.match(page,/draftContentChecklist/);
 assert.match(page,/Content checklist/);
 assert.match(page,/Still needed:/);
 assert.match(page,/Not approved or published/);
 assert.match(page,/<details className="apex-card-editor">/);
 assert.match(page,/<summary>Manage product image<\/summary>/);
 assert.match(page,/Edit details, SKU and price/);
 assert.match(page,/<summary>Create private draft product<\/summary>/);
 assert.match(page,/<summary>Add private category<\/summary>/);
 assert.match(page,/Source review:/);
 assert.match(page,/Review source and cost/);
 assert.match(css,/\.apex-card-editor > summary:focus-visible/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.doesNotMatch(page,/is_published:true/);
});
test("only active owner or manager of the exact private store gets editing controls",()=>{
 assert.match(page,/stores\.length===1&&!stores\[0\]\.is_public/);
 assert.match(page,/memberships\.some\(member=>member\.supplier_id===stores\[0\]\.supplier_id/);
 assert.match(page,/member\.role==="owner"\|\|member\.role==="manager"/);
 assert.match(page,/!product\.is_published && canWrite && <details/);
 assert.match(page,/enabled=\{canWrite\}/);
 assert.match(page,/View product details \(read-only\)/);
 assert.match(page,/View source review \(read-only\)/);
 assert.doesNotMatch(page,/grant update|service_role|\\.rpc\("publish/i);
});
