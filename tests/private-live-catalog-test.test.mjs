import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {answerPrivateCatalogPreview} from "../src/lib/catalog/private-catalog-test.mjs";
const read=path=>readFileSync(path,"utf8");
const products=[
 {id:"12345678-1234-1234-1234-123456789abc",name:"Sample Alpha",sku:"A-001",category:"Sample Category",priceCents:1299,currency:"USD",active:true,availableStock:0},
 {id:"12345678-1234-1234-1234-123456789abd",name:"Sample Beta",sku:"B-002",category:"Other Category",priceCents:2599,currency:"USD",active:false,availableStock:null},
];
test("private product preview answers use only supplied saved item prices",()=>{
 const a=answerPrivateCatalogPreview("Alpha",products);
 assert.equal(a.intent,"private-preview");
 assert.equal(a.items.length,1);
 assert.equal(a.items[0].price,"$12.99");
 assert.match(a.answer,/not publicly approved/i);
 assert.match(a.answer,/disabled/i);
 const b=answerPrivateCatalogPreview("Sample Category",products);
 assert.equal(b.items.length,1);
 assert.equal(answerPrivateCatalogPreview("invented, non-existent item",products).items.length,0);
});
test("private preview never makes product-use recommendations or unsafe disclosure",()=>{
 for(const prompt of ["how much to inject","what are the side effects","should I take this","is this safe for me?"]){
  const response=answerPrivateCatalogPreview(prompt,products);
  assert.equal(response.items.length,0,prompt);
 }
 const script=read("src/lib/catalog/private-catalog-test.mjs");
 assert.doesNotMatch(script,/fetch\s*\(|modelProvider|service_role|SUPABASE_SECRET|process\.env|\.insert\s*\(|\.update\s*\(/);
});
test("only an authenticated platform admin gets saved product preview",()=>{
 const server=read("src/app/admin/storefront-preview/page.tsx");
 const ui=read("src/app/admin/storefront-preview/live-catalog-tester.tsx");
 const css=read("src/app/admin/storefront-preview/live-catalog-tester.css");
 assert.match(server,/createSupplierServerClient/);
 assert.match(server,/client\.auth\.getUser\(\)/);
 assert.match(server,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(server,/\.from\("products"\)/);
 assert.match(server,/count:"exact"/);
 assert.match(server,/productCount!==products\?\.length/);
 assert.doesNotMatch(server,/SUPABASE_SECRET_KEY|service_role|auth\.admin|\.insert\s*\(|\.update\s*\(/);
 assert.match(ui,/answerPrivateCatalogPreview/);
 assert.match(ui,/PRIVATE LIVE-SITE TEST/);
 assert.match(css,/font-size:16px/);
 assert.doesNotMatch(ui,/createInvoice|checkout\/create|paymentIntent|purchase/);
});
