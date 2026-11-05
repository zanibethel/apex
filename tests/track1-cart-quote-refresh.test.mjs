import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";
const id="64000000-0000-0000-0000-000000000001";
const selection=[{product_id:id,quantity:2}];
const shipping={
 charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
 envelope_max_items:4,
};
const source=(unit,availability="in_stock")=>({
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:id,quantity:2,name:"Catalog product",
  unit_price_cents:String(unit),availability,can_checkout:false}],
 shipping,requested_code:"",promotion:null,
 can_place_order:false,can_create_invoice:false,can_reserve_stock:false,can_pay:false,
});
test("same saved cart is repriced and stock status refreshed from latest source",()=>{
 const initial=buildCartReview(source(9000),{items:selection,boxSize:"auto"});
 const revised=buildCartReview(source(11000,"insufficient_stock"),{items:selection,boxSize:"auto"});
 assert.equal(initial.ok,true);
 assert.equal(initial.merchandiseSubtotalCents,18000);
 assert.equal(initial.shippingCents,1500);
 assert.equal(revised.ok,true);
 assert.equal(revised.merchandiseSubtotalCents,22000);
 assert.equal(revised.shippingCents,0);
 assert.equal(revised.status,"unavailable_stock");
 assert.equal(revised.canPlaceOrder,false);
 assert.equal(revised.canPay,false);
});
test("browser refreshes quote without sending contact data or requesting orders",()=>{
 const page=readFileSync("src/app/cart/customer-cart-page.tsx","utf8");
 assert.match(page,/window\.addEventListener\("focus",refresh\)/);
 assert.match(page,/window\.addEventListener\("online",refresh\)/);
 assert.match(page,/document\.addEventListener\("visibilitychange",visible\)/);
 assert.match(page,/window\.setInterval\(visible,60_000\)/);
 assert.match(page,/window\.clearInterval\(interval\)/);
 assert.match(page,/refreshRevision/);
 assert.match(page,/cache:"no-store"/);
 assert.match(page,/Recheck prices &amp; stock/);
 assert.match(page,/freeShippingMinimumCents!=null/);
 assert.doesNotMatch(page,/fetch\("[^"]*checkout\/handoff|JSON\.stringify\(.*delivery|service_role/);
});
