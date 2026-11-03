import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newPromotionActive} from "../src/lib/commerce/promotion-management.mjs";
import {quoteDiscount} from "../src/lib/commerce/discount-quote.mjs";
import {quoteOptionalShipping} from "../src/lib/commerce/checkout-charge-rules.mjs";

const read=(path)=>readFileSync(path,"utf8");
const policy={charge_shipping:true,flat_shipping_cents:795,
 free_shipping_min_subtotal_cents:20000};
const code={
 code:"WELCOME10",is_active:true,discount_kind:"percentage",discount_value:10,
 min_subtotal_cents:5000,usage_limit:null,redemption_count:0,
 starts_at:null,ends_at:null,
};

test("new codes are active by default with explicit inactive alternative",()=>{
 assert.equal(newPromotionActive("active"),true);
 assert.equal(newPromotionActive(null),true);
 assert.equal(newPromotionActive(undefined),true);
 assert.equal(newPromotionActive("inactive"),false);
 for(const invalid of ["enabled","draft","preview","false","ACTIVE",true,0]){
  assert.equal(newPromotionActive(invalid),null);
 }
});

test("active new code is eligible for the actual shipping-only price calculation",()=>{
 const applied=quoteDiscount(code,10000);
 assert.equal(applied.eligible,true);
 assert.equal(applied.discountCents,1000);
 const shipping=quoteOptionalShipping(policy,applied.totalCents);
 assert.equal(shipping.shippingCents,795);
 assert.equal(applied.totalCents+shipping.shippingCents,9795);
 const unavailable=quoteDiscount({...code,is_active:false},10000);
 assert.equal(unavailable.eligible,false);
});

test("free-shipping codes retain separate discount and delivery amounts",()=>{
 const free=quoteDiscount({
  ...code,discount_kind:"free_shipping",discount_value:1,
 },10000);
 assert.equal(free.eligible,true);
 assert.equal(free.discountCents,0);
 assert.equal(free.freeShipping,true);
 const ship=quoteOptionalShipping(policy,free.totalCents,free.freeShipping);
 assert.equal(ship.shippingCents,0);
 assert.equal(ship.shippingDiscountCents,795);
});

test("actions insert active state by choice and preserve explicit activation controls",()=>{
 const actions=read("src/app/supplier/discounts/actions.ts");
 const form=read("src/app/supplier/discounts/forms.tsx");
 assert.match(actions,/newPromotionActive\(form\.get\("initialStatus"\)\)/);
 assert.match(actions,/is_active:activeOnCreate/);
 assert.match(actions,/Code created/);
 assert.match(actions,/Code activated/);
 assert.match(actions,/Code deactivated/);
 assert.match(actions,/result\.totalCents\+shipping\.shippingCents/);
 assert.match(form,/Create code/);
 assert.match(form,/option value="active"/);
 assert.match(form,/option value="inactive"/);
 assert.match(form,/Deactivate code/);
 assert.match(form,/Activate code/);
 assert.match(form,/Discount calculator/);
 assert.match(form,/Calculate discount/);
 for(const unneeded of [
  /Create inactive code/,/Simulate checkout discount/,/test subtotal/i,
  /Preview discount/,/Enable code in preview/,/Draft promotion/,
  /Private preview/,/Live checkout disabled/,
 ]){
  assert.doesNotMatch(actions,unneeded);
  assert.doesNotMatch(form,unneeded);
 }
});

test("supplier and admin pages share production-style management and compact mobile CSS",()=>{
 const supplier=read("src/app/supplier/discounts/page.tsx");
 const admin=read("src/app/admin/shipping-promotions/page.tsx");
 const css=read("src/app/supplier/discounts/promotions.css");
 for(const page of [supplier,admin]){
  assert.match(page,/PromotionCalculator/);
  assert.match(page,/Active/);
  assert.match(page,/Inactive/);
  assert.match(page,/Edit code/);
  assert.doesNotMatch(page,/private preview|test subtotal|simulate checkout|Active in preview|draft mode/i);
 }
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/apex-promo-code-grid/);
 assert.match(css,/apex-promo-grid/);
});
