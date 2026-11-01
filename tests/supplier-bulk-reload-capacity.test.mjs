import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SUPPLIER_BULK_PRODUCT_CAPACITY,SUPPLIER_BULK_PRODUCT_QUERY_LIMIT,supplierBulkProductWindowStatus}
 from "../src/lib/catalog/supplier-bulk-capacity.mjs";

const page=readFileSync("src/app/supplier/catalog/bulk/page.tsx","utf8");
const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const csv=readFileSync("src/app/supplier/catalog/csv-product-import.tsx","utf8");

test("reloading up to 250 private product cards is not silently truncated",()=>{
 assert.equal(SUPPLIER_BULK_PRODUCT_CAPACITY,250);
 assert.equal(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT,251);
 for(const n of [0,1,25,100,101,250])
  assert.equal(supplierBulkProductWindowStatus(Array(n).fill({id:"private"})),"complete");
 assert.equal(supplierBulkProductWindowStatus(Array(251).fill({id:"private"})),"over-limit");
 assert.equal(supplierBulkProductWindowStatus([]),"complete");
 assert.equal(supplierBulkProductWindowStatus(null),"unavailable");
});

test("server checks over-capacity before building private media and catalog cards",()=>{
 assert.match(page,/\.eq\("store_id",store\.id\)\.eq\("is_published",false\)\.order\("name"\)\.limit\(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT\)/);
 assert.match(page,/\.limit\(SUPPLIER_BULK_PRODUCT_CAPACITY\)/);
 assert.ok(page.indexOf('supplierBulkProductWindowStatus(products)!=="complete"')<
  page.indexOf("const signedImages=new Map"));
 assert.match(page,/No products were changed/);
 assert.match(page,/Back to product manager/);
 assert.match(page,/more than \{SUPPLIER_BULK_PRODUCT_CAPACITY\} products/);
 assert.doesNotMatch(page,/The first 100 private products are shown/);
});

test("client and CSV import share the same 250-card boundary in view",()=>{
 assert.match(editor,/rows\.length\+count>250/);
 assert.match(editor,/rows\.length>=250/);
 assert.match(editor,/pendingSaveRows\.length<=250/);
 assert.match(csv,/rows\.length\+additions>250/);
 assert.match(csv,/editor supports up to 250 rows/);
 assert.match(csv,/Product ID does not belong to this store/);
 assert.match(csv,/Product ID and SKU identify different products/);
});

test("bulk capacity change never alters public catalog or publication permissions",()=>{
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(page,/\.eq\("is_public",false\)/);
 assert.match(page,/\.eq\("is_published",false\)/);
 assert.match(page,/\["hold","review"\]/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|is_published:true|is_public:true/);
});
