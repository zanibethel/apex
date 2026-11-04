import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteOptionalShipping,previewCheckoutCharges}
 from "../src/lib/commerce/checkout-charge-rules.mjs";
const file=p=>readFileSync(p,"utf8");
const id="64000000-0000-0000-0000-000000000001";
const policy={charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001};
const promo=(kind,value)=>({
 code:"PROMO",is_active:true,discount_kind:kind,discount_value:value,
 min_subtotal_cents:0,starts_at:null,ends_at:null,
 usage_limit:null,redemption_count:0,
});

test("Padded Flat Rate Envelope is the default $15 tier and Medium remains $25.80",()=>{
 const regular=quoteOptionalShipping(policy,19999);
 const medium=quoteOptionalShipping(policy,19999,false,"medium");
 assert.equal(regular.shippingBoxSize,"small");
 assert.equal(regular.shippingCents,1500);
 assert.equal(medium.shippingCents,2580);
 assert.equal(regular.amountUntilFreeShippingCents,2);
 for(const amount of [20000,20001,22500]){
  const expected=amount===20000?1500:0;
  assert.equal(quoteOptionalShipping(policy,amount).shippingCents,expected);
  assert.equal(quoteOptionalShipping(policy,amount,false,"medium").shippingCents,
   amount===20000?2580:0);
 }
});

test("Padded and Medium quotes both honor discount thresholds and free-shipping codes",()=>{
 const lines=[{productId:id,quantity:1,unitPriceCents:22000}];
 const afterPromo=previewCheckoutCharges({lines,shippingPolicy:policy,
  discountCode:promo("percentage",10)});
 assert.equal(afterPromo.discountedMerchandiseCents,19800);
 assert.equal(afterPromo.shippingCents,1500);
 assert.equal(afterPromo.totalCents,21300);
 const medium=previewCheckoutCharges({lines,shippingPolicy:policy,boxSize:"medium",
  discountCode:promo("percentage",10)});
 assert.equal(medium.shippingCents,2580);
 assert.equal(medium.totalCents,22380);
 const waived=previewCheckoutCharges({lines:[{...lines[0],unitPriceCents:10000}],
  shippingPolicy:policy,discountCode:promo("free_shipping",1)});
 assert.equal(waived.shippingCents,0);
 assert.equal(waived.freeShippingReason,"discount_code");
 assert.equal(waived.canCreateInvoice,false);
 assert.equal(waived.canPlaceOrder,false);
});

test("supplier, admin, and promotions screens use padded envelope labels with default",()=>{
 const supplier=file("src/app/supplier/checkout-rules/shipping-form.tsx");
 const admin=file("src/app/admin/checkout-review/checkout-catalog-review.tsx");
 const charge=file("src/app/admin/checkout-review/admin-destination-charge-form.tsx");
 const promos=file("src/app/supplier/discounts/forms.tsx");
 assert.match(supplier,/Padded Flat Rate Envelope \(USD\)/);
 assert.match(supplier,/initial\.flat_shipping_cents:1500/);
 assert.match(admin,/useState<"small"\|"medium">\("small"\)/);
 assert.match(admin,/value="small">Padded Flat Rate Envelope/);
 assert.match(admin,/value="medium">Medium Flat Rate Box/);
 assert.match(charge,/Padded Envelope/);
 assert.match(promos,/name="boxSize" defaultValue="small"/);
 assert.match(promos,/value="small">Padded Flat Rate Envelope/);
 for(const text of [supplier,admin,charge,promos]){
  assert.doesNotMatch(text,/Small Flat Rate box|Small Flat Rate Box/);
 }
});

test("existing internal small tier stays stable for server-side pricing",()=>{
 const src=file("src/lib/commerce/checkout-charge-rules.mjs");
 const service=file("src/app/supplier/checkout-rules/actions.ts");
 assert.match(src,/Legacy tier key "small" means the padded envelope/);
 assert.match(src,/boxSize="small"/);
 assert.match(service,/save_private_store_usps_shipping_capacity/);
 assert.doesNotMatch(service,/APEX_CHECKOUT_MODE|checkout_enabled:true/);
});
