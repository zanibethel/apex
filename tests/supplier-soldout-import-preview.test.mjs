import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {proposedSoldOutPricing} from "../src/lib/catalog/sold-out-import-pricing.mjs";
const read=p=>readFileSync(p,"utf8");

test("source cost ×2 selling price and ×2.5 proposed reference with exact cent rounding",()=>{
 const example=proposedSoldOutPricing("840");
 assert.deepEqual(example,{
  sourceCostCents:840,salePriceCents:1680,compareAtCents:2100,
  listedStock:0,canAddToCart:false,canCheckout:false,priceReferenceVerified:false,
 });
 assert.equal(proposedSoldOutPricing(600).salePriceCents,1200);
 assert.equal(proposedSoldOutPricing("5650").compareAtCents,14125);
 assert.equal(proposedSoldOutPricing("601").compareAtCents,1503);
 assert.equal(proposedSoldOutPricing("601").salePriceCents,1202);
 assert.equal(Object.isFrozen(example),true);
});
test("unsupported cost values fail closed and never produce free items",()=>{
 for(const raw of [null,undefined,-1,0,1.01,"0","0001","$8.40","1e6","-5","",9999999999999999999]){
  assert.equal(proposedSoldOutPricing(raw),null);
 }
 assert.equal(proposedSoldOutPricing("999999999"),null);
});
test("sold-out supplier preview is tenant-scoped, private and nonpayable",()=>{
 const page=read("src/app/supplier/imports/sold-out-preview/page.tsx");
 const source=read("src/lib/catalog/sold-out-import-pricing.mjs");
 const importPage=read("src/app/supplier/imports/page.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/w\.memberships\.some/);
 assert.match(page,/role==="owner"\|\|m\.role==="manager"/);
 assert.match(page,/\.eq\("store_id",store\.id\)/);
 assert.match(page,/source\.count!==source\.data\?\.length/);
 assert.match(page,/supplier_import_candidates/);
 assert.match(page,/\.createSignedUrl\(sourceImage,120\)/);
 assert.match(page,/same existing uploaded image/);
 assert.match(page,/SOLD OUT/);
 assert.match(page,/Not public or purchasable/);
 assert.match(page,/review_status!=="approved_for_draft"/);
 assert.match(page,/0 units shown in preview/);
 assert.match(page,/<button type="button" disabled/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|createPublicUrl|service_role|NEXT_PUBLIC_SUPABASE_SECRET|\.rpc\(/);
 assert.doesNotMatch(page,/Add to cart|Add to Cart|href="\/checkout|Pay with Bitcoin/i);
 assert.match(importPage,/href="\/supplier\/imports\/sold-out-preview"/);
 assert.doesNotMatch(source,/createInvoice|createOrder|wallet|transfer/i);
});
test("compare reference is not misrepresented as an established previous price",()=>{
 const page=read("src/app/supplier/imports/sold-out-preview/page.tsx");
 const css=read("src/app/supplier/imports/sold-out-preview/sold-out-preview.css");
 assert.match(page,/not verified former selling prices/);
 assert.match(page,/no percentage-off or strike-through discount claims/);
 assert.doesNotMatch(page,/<s>|% OFF|\bdiscount-badge\b/);
 assert.match(css,/\.apex-soldout-badge/);
});
