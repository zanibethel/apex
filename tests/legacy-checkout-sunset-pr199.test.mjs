import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
test("legacy sample checkout cannot render or become a customer route",()=>{
 const route=read("src/app/checkout/preview/page.tsx");
 assert.match(route,/isVerifiedPlatformAdmin/);
 assert.match(route,/notFound\(\)/);
 assert.match(route,/redirect\("\/admin\/checkout-review"\)/);
 assert.doesNotMatch(route,/CheckoutPreview|APEX_CHECKOUT_MODE|TEST MODE|SIMULATED|demo shopping cart/);
});
test("checkout readiness reports disabled actual capabilities without fictional content",()=>{
 const page=read("src/app/admin/checkout-readiness/page.tsx");
 assert.match(page,/const checkoutMode="disabled" as const/);
 assert.match(page,/Customer checkout:<\/strong> Unavailable/);
 assert.match(page,/Order creation:<\/strong> Blocked/);
 assert.match(page,/BTCPay invoice creation:<\/strong> Blocked/);
 assert.doesNotMatch(page,/Fictional interactive demo|demo shopping cart|fictional sample catalog/);
});
test("production promotions do not expose staging labels",()=>{
 const files=[
  "src/app/supplier/discounts/page.tsx",
  "src/app/admin/shipping-promotions/page.tsx",
  "src/app/supplier/discounts/forms.tsx",
  "src/app/admin/checkout-review/page.tsx",
 ];
 for(const path of files){
  const source=read(path);
  assert.doesNotMatch(source,/Simulate checkout|Create inactive code|Test subtotal|Preview discount|Fictional interactive demo|TEST MODE/);
 }
});
