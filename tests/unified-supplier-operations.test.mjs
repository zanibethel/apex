import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = path=>readFileSync(path,"utf8");

test("supplier home surfaces distinct real-data counts and action links",()=>{
 const page=read("src/app/supplier/page.tsx");
 for(const table of ["products","inventory_items","supplier_import_candidates","supplier_sales_history","supplier_wallet_requests"]){
   assert.ok(page.includes(`.from("${table}")`), "missing scoped count: "+table);
 }
 for(const link of ["/supplier/imports","/supplier/catalog","/supplier/inventory","/supplier/reports","/supplier/wallets"]){
   assert.ok(page.includes(link),"missing link: "+link);
 }
 assert.match(page,/Imported variants to review/);
 assert.match(page,/separate from drafted products and actual stock/);
});

test("catalog shows restricted source variants without treating wholesale prices as retail",()=>{
 const page=read("src/app/supplier/catalog/page.tsx");
 assert.match(page,/supplier_import_candidates/);
 assert.match(page,/\.in\("store_id",\s*ids\)/);
 assert.match(page,/count:"exact"/);
 assert.match(page,/ImportReviewForm/);
 assert.match(page,/Unverified wholesale cost/);
 assert.match(page,/Source variants remain private|not published catalog items/);
 assert.doesNotMatch(page,/\.insert\(|\.upsert\(|service_role/);
});

test("inventory does not invent stock from unverified imports",()=>{
 const page=read("src/app/supplier/inventory/page.tsx");
 assert.match(page,/supplier_import_candidates/);
 assert.match(page,/No confirmed inventory yet/);
 assert.match(page,/actual stock quantities have not been provided/);
 assert.match(page,/\/supplier\/imports/);
 assert.doesNotMatch(page,/\.insert\(|service_role/);
});

test("supplier panels stay separate from admin split settings",()=>{
 const supplier=read("src/app/supplier/page.tsx");
 const admin=read("src/app/admin/page.tsx");
 assert.ok(admin.includes("/admin/splits"));
 assert.ok(!supplier.includes("/admin/splits"));
});
