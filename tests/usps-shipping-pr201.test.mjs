import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteOptionalShipping,previewCheckoutCharges}
 from "../src/lib/commerce/checkout-charge-rules.mjs";
import {parsePrivateDestinationChargeSource,estimatePrivateDestinationCharges}
 from "../src/lib/checkout/admin-destination-charge.mjs";

const storeId="62000000-0000-0000-0000-000000000001";
const productId="64000000-0000-0000-0000-000000000001";
const policy={
 charge_shipping:true,flat_shipping_cents:1465,
 medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
};
const line={productId,quantity:1,unitPriceCents:20000};
const promo=(kind,value)=>({
 code:"SAVE10",is_active:true,discount_kind:kind,discount_value:value,
 min_subtotal_cents:0,starts_at:null,ends_at:null,usage_limit:null,redemption_count:0,
});
const money=(cents,boxSize)=>quoteOptionalShipping(policy,cents,false,boxSize);
const file=p=>readFileSync(p,"utf8");

test("USPS retail Small and Medium charged separately at and below $200",()=>{
 for(const amount of [10000,19999,20000]){
  const small=money(amount,"small");
  const medium=money(amount,"medium");
  assert.equal(small.shippingCents,1465);
  assert.equal(medium.shippingCents,2580);
  assert.equal(small.freeShippingReason,"none");
  assert.equal(medium.freeShippingReason,"none");
 }
 assert.equal(money(20000,"small").amountUntilFreeShippingCents,1);
 assert.equal(money(20000,"medium").amountUntilFreeShippingCents,1);
});

test("strictly over $200 uses free USPS shipping, either box",()=>{
 for(const size of ["small","medium"]){
  const at=money(20001,size);
  assert.equal(at.shippingCents,0);
  assert.equal(at.originalShippingCents,size==="small"?1465:2580);
  assert.equal(at.shippingDiscountCents,size==="small"?1465:2580);
  assert.equal(at.freeShippingReason,"subtotal_threshold");
  assert.equal(at.amountUntilFreeShippingCents,0);
 }
});

test("post-discount subtotal, not original merchandise, qualifies for free shipping",()=>{
 const noPromo=previewCheckoutCharges({lines:[{...line,unitPriceCents:22000}],
  shippingPolicy:policy,boxSize:"medium"});
 assert.equal(noPromo.shippingCents,0);
 const discounted=previewCheckoutCharges({lines:[{...line,unitPriceCents:22000}],
  shippingPolicy:policy,boxSize:"medium",discountCode:promo("percentage",10)});
 assert.equal(discounted.discountedMerchandiseCents,19800);
 assert.equal(discounted.shippingCents,2580);
 assert.equal(discounted.totalCents,22380);
 assert.equal(discounted.amountUntilFreeShippingCents,201);
});

test("eligible shipping code independently waives either box fee",()=>{
 for(const size of ["small","medium"]){
  const result=previewCheckoutCharges({lines:[{...line,unitPriceCents:10000}],
   shippingPolicy:policy,boxSize:size,discountCode:promo("free_shipping",1)});
  assert.equal(result.ok,true);
  assert.equal(result.shippingCents,0);
  assert.equal(result.freeShippingReason,"discount_code");
  assert.equal(result.merchandiseDiscountCents,0);
  assert.equal(result.totalCents,10000);
 }
});

test("bad box sizes or missing Medium rates fail closed",()=>{
 assert.equal(money(10000,"large"),null);
 assert.equal(quoteOptionalShipping({...policy,medium_flat_shipping_cents:-1},
  10000,false,"medium"),null);
 assert.equal(quoteOptionalShipping({...policy,medium_flat_shipping_cents:0},
  10000,false,"medium"),null);
 assert.equal(quoteOptionalShipping({charge_shipping:true,flat_shipping_cents:1465,
  free_shipping_min_subtotal_cents:20001},10000,false,"medium"),null);
 const invalid=previewCheckoutCharges({lines:[line],shippingPolicy:policy,
  boxSize:"large"});
 assert.equal(invalid.ok,false);
 assert.equal(invalid.canPlaceOrder,false);
});

test("private admin source keeps original authorization and uses chosen box",()=>{
 const source={
  schema_version:2,state:"private_shipping_charge_source",
  store_id:storeId,product_id:productId,quantity:1,name:"Private listing",
  currency:"USD",unit_price_cents:20000,observed_subtotal_cents:20000,
  quantity_available:0,shipping:policy,requested_code:"",promotion_found:false,
  promotion:null,can_create_order:false,can_create_invoice:false,
  can_reserve_stock:false,can_pay:false,checkout_enabled:false,
 };
 const parsed=parsePrivateDestinationChargeSource(source,{
  storeId,productId,quantity:1,code:""});
 assert.ok(parsed);
 const small=estimatePrivateDestinationCharges(parsed,{
  code:"",expectedSubtotalCents:20000,boxSize:"small"});
 const medium=estimatePrivateDestinationCharges(parsed,{
  code:"",expectedSubtotalCents:20000,boxSize:"medium"});
 assert.equal(small.shippingCents,1465);
 assert.equal(medium.shippingCents,2580);
 assert.equal(small.totalCents,21465);
 assert.equal(medium.totalCents,22580);
 assert.equal(small.canPay,false);
 assert.equal(medium.canCreateInvoice,false);
});

test("UI stores two rates and propagates selected box to server pricing",()=>{
 const shipping=file("src/app/supplier/checkout-rules/shipping-form.tsx");
 const action=file("src/app/supplier/checkout-rules/actions.ts");
 const admin=file("src/app/admin/checkout-review/checkout-catalog-review.tsx");
 const server=file("src/app/admin/checkout-review/destination-charge-actions.ts");
 const promo=file("src/app/supplier/discounts/actions.ts");
 const migration=file("supabase/migrations/20261104002000_apex_usps_small_medium_flat_rate.sql");
 const workflow=file(".github/workflows/payout-rls.yml");
 assert.match(shipping,/smallFlatShipping/);
 assert.match(shipping,/mediumFlatShipping/);
 assert.match(shipping,/20001/);
 assert.match(action,/save_private_store_usps_shipping_settings/);
 assert.match(admin,/boxSize/);
 assert.match(server,/boxSize/);
 assert.match(promo,/medium_flat_shipping_cents/);
 assert.match(migration,/medium_flat_shipping_cents/);
 assert.match(migration,/revoke execute on function public.save_private_store_shipping_settings/);
 assert.match(workflow,/usps-flat-rate-shipping.sql/);
 assert.doesNotMatch(migration,/invoice.*insert|checkout_enabled',true/i);
});
