import test from "node:test";
import assert from "node:assert/strict";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";

const productId="64000000-0000-0000-0000-000000000001";
const items=[{product_id:productId,quantity:1}];
const base={
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:productId,quantity:1,name:"Public catalog item",
  unit_price_cents:"20000",availability:"sold_out",can_checkout:false}],
 requested_code:"",promotion:null,can_place_order:false,
 can_create_invoice:false,can_reserve_stock:false,can_pay:false,
};
const shipping={
 charge_shipping:true,flat_shipping_cents:1500,medium_flat_shipping_cents:2580,
 free_shipping_min_subtotal_cents:20001,envelope_max_items:4,
};
const quote=policy=>buildCartReview({...base,shipping:policy},{items,boxSize:"auto"});

test("supplier can waive shipping entirely while cart remains nonpayable",()=>{
 const waived=quote({
  charge_shipping:false,flat_shipping_cents:0,medium_flat_shipping_cents:0,
  free_shipping_min_subtotal_cents:null,envelope_max_items:4,
 });
 assert.equal(waived.ok,true);
 assert.equal(waived.shippingCents,0);
 assert.equal(waived.freeShippingReason,"no_charge");
 assert.equal(waived.freeShippingMinimumCents,null);
 assert.equal(waived.totalCents,20000);
 assert.equal(waived.canPlaceOrder,false);
 assert.equal(waived.canPay,false);
});
test("paid shipping may omit free-shipping threshold without inventing $200",()=>{
 const result=quote({...shipping,free_shipping_min_subtotal_cents:null});
 assert.equal(result.ok,true);
 assert.equal(result.shippingCents,1500);
 assert.equal(result.freeShippingMinimumCents,null);
 assert.equal(result.amountUntilFreeShippingCents,null);
 assert.equal(result.totalCents,21500);
});
test("stored strictly-over-$200 shipping threshold remains unchanged",()=>{
 assert.equal(quote(shipping).shippingCents,1500);
 const higher=buildCartReview({...base,
  items:[{...base.items[0],unit_price_cents:"20001"}],shipping
 },{items,boxSize:"auto"});
 assert.equal(higher.ok,true);
 assert.equal(higher.shippingCents,0);
 assert.equal(higher.totalCents,20001);
});
test("invalid optional-shipping state always fails closed",()=>{
 for(const invalid of [
  {...shipping,charge_shipping:false},
  {...shipping,charge_shipping:false,flat_shipping_cents:0,medium_flat_shipping_cents:0},
  {...shipping,charge_shipping:false,flat_shipping_cents:0,
   medium_flat_shipping_cents:0,free_shipping_min_subtotal_cents:20001},
  {...shipping,charge_shipping:"false"},
  {...shipping,medium_flat_shipping_cents:1},
  {...shipping,free_shipping_min_subtotal_cents:0},
 ])assert.equal(quote(invalid).ok,false,JSON.stringify(invalid));
});
