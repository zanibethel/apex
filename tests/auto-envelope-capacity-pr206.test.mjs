import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveUspsPackage,quoteOptionalShipping,previewCheckoutCharges}
 from "../src/lib/commerce/checkout-charge-rules.mjs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";
const read=p=>readFileSync(p,"utf8");
const id="64000000-0000-0000-0000-000000000001";
const policy={
 charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
 envelope_max_items:4,
};
const lines=quantity=>[{productId:id,quantity,unitPriceCents:1000}];
const promo={code:"SHIPFREE",is_active:true,discount_kind:"free_shipping",
 discount_value:1,min_subtotal_cents:0,starts_at:null,ends_at:null,
 usage_limit:null,redemption_count:0};
test("stored capacity chooses envelope through 4 units, Medium at 5+",()=>{
 for(const n of [1,2,3,4]){
  assert.equal(resolveUspsPackage(policy,n),"small");
  const quote=previewCheckoutCharges({lines:lines(n),shippingPolicy:policy,boxSize:"auto"});
  assert.equal(quote.ok,true);
  assert.equal(quote.shippingBoxSize,"small");
  assert.equal(quote.shippingCents,1500);
  assert.equal(quote.envelopeMaxItems,4);
 }
 for(const n of [5,6,10]){
  assert.equal(resolveUspsPackage(policy,n),"medium");
  const quote=previewCheckoutCharges({lines:lines(n),shippingPolicy:policy,boxSize:"auto"});
  assert.equal(quote.ok,true);
  assert.equal(quote.shippingBoxSize,"medium");
  assert.equal(quote.shippingCents,2580);
 }
});
test("supplier/admin can update envelope capacity without changing prices",()=>{
 const three={...policy,envelope_max_items:3};
 assert.equal(resolveUspsPackage(three,3),"small");
 assert.equal(resolveUspsPackage(three,4),"medium");
 const eight={...policy,envelope_max_items:8};
 assert.equal(resolveUspsPackage(eight,5),"small");
 assert.equal(resolveUspsPackage(eight,9),"medium");
 for(const capacity of [0,51,1.5,"4",null]){
  assert.equal(resolveUspsPackage({...policy,envelope_max_items:capacity},4),null);
 }
});
test("a manual Medium upgrade is permitted; a manual undersize cannot bypass capacity",()=>{
 assert.equal(quoteOptionalShipping(policy,10000,false,"medium",2).shippingCents,2580);
 assert.equal(quoteOptionalShipping(policy,10000,false,"small",5).shippingCents,2580);
 assert.equal(quoteOptionalShipping(policy,10000,false,"auto",5).shippingCents,2580);
 assert.equal(quoteOptionalShipping(policy,10000,false,"auto",0),null);
 assert.equal(quoteOptionalShipping(policy,10000,false,"large",2),null);
});
test("free shipping applies above $200 after discounts regardless of automatic box",()=>{
 for(const quantity of [4,5]){
  const one=[{...lines(quantity)[0],unitPriceCents:6000}];
  const result=previewCheckoutCharges({lines:one,shippingPolicy:policy,boxSize:"auto"});
  assert.equal(result.shippingCents,0);
  assert.equal(result.shippingBoxSize,quantity===4?"small":"medium");
  const waived=previewCheckoutCharges({lines:lines(quantity),
   shippingPolicy:policy,discountCode:promo,boxSize:"auto"});
  assert.equal(waived.shippingCents,0);
  assert.equal(waived.freeShippingReason,"discount_code");
  assert.equal(waived.canPay,false);
 }
});
test("strict customer cart server source chooses based on quantity",()=>{
 const makeSource=q=>({
  schema_version:1,state:"rechecked_sold_out_cart",
  items:[{product_id:id,quantity:q,name:"Sample catalog item",
   unit_price_cents:"1000",availability:"sold_out",can_checkout:false}],
  shipping:policy,requested_code:"",promotion:null,
  can_place_order:false,can_create_invoice:false,
  can_reserve_stock:false,can_pay:false,
 });
 for(const [q,expected] of [[4,"small"],[5,"medium"]]){
  const selection=[{product_id:id,quantity:q}];
  const result=buildCartReview(makeSource(q),{items:selection,boxSize:"auto"});
  assert.equal(result.ok,true);
  assert.equal(result.shippingBoxSize,expected);
  assert.equal(result.envelopeMaxItems,4);
 }
 const selection=[{product_id:id,quantity:5}];
 assert.equal(buildCartReview({...makeSource(5),shipping:{
  ...policy,envelope_max_items:undefined,
 }},{items:selection,boxSize:"auto"}).ok,false);
});
test("saved rule and GUI are available to both admin and supplier",()=>{
 const form=read("src/app/supplier/checkout-rules/shipping-form.tsx");
 const action=read("src/app/supplier/checkout-rules/actions.ts");
 const supplier=read("src/app/supplier/shipping/page.tsx");
 const admin=read("src/app/admin/checkout-rules/page.tsx");
 const supplierHome=read("src/app/supplier/page.tsx");
 const cart=read("src/app/cart/customer-cart-page.tsx");
 const adminCart=read("src/app/admin/order-admission/actions.ts");
 const adminUI=read("src/app/admin/order-admission/order-admission-workspace.tsx");
 const api=read("src/app/api/cart/quote/route.ts");
 const migration=read("supabase/migrations/20261104093000_apex_auto_envelope_max_items.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(form,/name="envelopeMaxItems"/);
 assert.match(form,/defaultValue=\{initial.envelope_max_items\}/);
 assert.match(action,/p_envelope_max_items:envelopeLimit/);
 assert.match(action,/save_private_store_usps_shipping_capacity/);
 assert.match(supplier,/envelope_max_items/);
 assert.match(admin,/envelope_max_items/);
 assert.match(supplierHome,/href="\/supplier\/shipping"/);
 assert.match(cart,/boxSize="auto"|const boxSize="auto"/);
 assert.doesNotMatch(cart,/type="radio" name="package"/);
 assert.match(adminCart,/envelope_max_items/);
 assert.match(adminUI,/Automatic packaging/);
 assert.match(api,/get_public_cart_quote_source/);
 assert.match(migration,/alter table public.apex_store_shipping_settings/);
 assert.match(migration,/create function public.save_private_store_usps_shipping_capacity/);
 assert.match(migration,/revoke execute on function public.save_private_store_usps_shipping_settings/);
 assert.match(migration,/envelope_max_items',v_ship.envelope_max_items/);
 assert.match(workflow,/auto-envelope-capacity.sql/);
 assert.doesNotMatch(migration,/insert into apex_internal.checkout_order_intents|can_pay',true/i);
});
