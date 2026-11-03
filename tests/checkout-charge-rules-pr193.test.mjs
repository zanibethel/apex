import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {quoteDiscount} from "../src/lib/commerce/discount-quote.mjs";
import {previewCheckoutCharges,quoteOptionalShipping}
 from "../src/lib/commerce/checkout-charge-rules.mjs";

const id1="64000000-0000-0000-0000-000000000001";
const id2="64000000-0000-0000-0000-000000000002";
const lines=[
 {productId:id1,quantity:1,unitPriceCents:6000},
 {productId:id2,quantity:1,unitPriceCents:4000},
];
const shipping={charge_shipping:true,flat_shipping_cents:795,
 free_shipping_min_subtotal_cents:9000};
const code=(kind,value,minimum=0)=>({
 code:"TESTCODE",is_active:true,discount_kind:kind,
 discount_value:value,min_subtotal_cents:minimum,
 starts_at:null,ends_at:null,usage_limit:null,redemption_count:0,
});
const read=p=>readFileSync(p,"utf8");

test("checkout sums merchandise and shipping without a tax field or tax provider",()=>{
 const r=previewCheckoutCharges({lines,shippingPolicy:shipping});
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseSubtotalCents,10000);
 assert.equal(r.totalCents,10000);
 assert.equal(r.shippingCents,0);
 assert.equal(r.freeShippingReason,"subtotal_threshold");
 assert.equal(r.canPlaceOrder,false);
 assert.equal(r.canCreateInvoice,false);
 assert.equal(r.canPay,false);
 assert.equal(r.quoteFinalized,false);
 assert.equal(Object.hasOwn(r,"taxCents"),false);
 assert.equal(Object.hasOwn(r,"collectSalesTax"),false);
 assert.equal(Object.hasOwn(r,"taxableMerchandiseCents"),false);
});

test("a merchandise promotion can move a cart below the free-shipping minimum",()=>{
 const p=previewCheckoutCharges({
  lines,shippingPolicy:shipping,discountCode:code("percentage",10),
 });
 assert.equal(p.merchandiseDiscountCents,1000);
 assert.equal(p.discountedMerchandiseCents,9000);
 assert.equal(p.shippingCents,0);
 assert.equal(p.totalCents,9000);
 const r=previewCheckoutCharges({
  lines,shippingPolicy:shipping,discountCode:code("fixed",2000),
 });
 assert.equal(r.merchandiseDiscountCents,2000);
 assert.equal(r.shippingCents,795);
 assert.equal(r.totalCents,8795);
 assert.equal(r.freeShippingReason,"none");
});

test("eligible free shipping codes waive the delivery fee without changing merchandise",()=>{
 const promo=code("free_shipping",1,5000);
 const q=quoteDiscount(promo,8000);
 assert.equal(q.eligible,true);
 assert.equal(q.discountCents,0);
 assert.equal(q.freeShipping,true);
 const policy={...shipping,free_shipping_min_subtotal_cents:20000};
 const r=previewCheckoutCharges({lines,shippingPolicy:policy,discountCode:promo});
 assert.equal(r.merchandiseDiscountCents,0);
 assert.equal(r.shippingDiscountCents,795);
 assert.equal(r.shippingCents,0);
 assert.equal(r.totalCents,10000);
 assert.equal(r.freeShippingReason,"discount_code");
 assert.equal(quoteDiscount(code("free_shipping",99),10000).eligible,false);
 assert.equal(quoteDiscount(code("free_shipping",1,12000),10000).eligible,false);
});

test("optional shipping can be disabled while invalid combinations fail closed",()=>{
 const free={charge_shipping:false,flat_shipping_cents:0,
  free_shipping_min_subtotal_cents:null};
 assert.equal(quoteOptionalShipping(free,500).shippingCents,0);
 assert.equal(previewCheckoutCharges({lines,shippingPolicy:free}).totalCents,10000);
 assert.equal(quoteOptionalShipping({...free,flat_shipping_cents:795},500),null);
 assert.equal(quoteOptionalShipping({...free,free_shipping_min_subtotal_cents:0},500),null);
 assert.equal(quoteOptionalShipping({...shipping,flat_shipping_cents:-1},500),null);
});

test("invalid product, quantity, duplicate and overflow amounts fail closed",()=>{
 const check=ls=>previewCheckoutCharges({lines:ls,shippingPolicy:shipping});
 assert.equal(check([lines[0],lines[0]]).ok,false);
 assert.equal(check([{...lines[0],quantity:11}]).ok,false);
 assert.equal(check([{...lines[0],unitPriceCents:0}]).ok,false);
 assert.equal(check([{...lines[0],unitPriceCents:999999999,quantity:2}]).ok,false);
 assert.equal(previewCheckoutCharges({lines,shippingPolicy:undefined}).ok,false);
});

test("product tax controls and tax API are removed while shipping forms remain",()=>{
 const bulk=read("src/app/supplier/catalog/bulk-editor.tsx");
 const admin=read("src/app/admin/checkout-rules/page.tsx");
 const menu=read("src/app/admin/page.tsx");
 const shippingForm=read("src/app/supplier/checkout-rules/shipping-form.tsx");
 const serverAction=read("src/app/supplier/checkout-rules/actions.ts");
 const checkout=read("src/app/admin/checkout-review/destination-charge-actions.ts");
 const sql=read("supabase/migrations/20261103223000_apex_shipping_only_checkout.sql");
 assert.doesNotMatch(bulk,/saveSelectedTaxCollection|collectSalesTax|Collect sales tax/);
 assert.doesNotMatch(admin,/TaxCollectionBulkPanel|collect_sales_tax|TaxCloud/);
 assert.doesNotMatch(checkout,/TaxCloud|requestPrivateTaxCloudEstimate|collectSalesTax/);
 assert.doesNotMatch(menu,/TaxCloud|Sales tax provider|Tax & shipping/);
 assert.match(shippingForm,/free-shipping code/);
 assert.match(serverAction,/save_private_store_shipping_settings/);
 assert.doesNotMatch(serverAction,/set_bulk_product_tax_collection/);
 assert.match(sql,/revoke execute on function public.set_bulk_product_tax_collection/);
 assert.match(sql,/schema_version',2/);
 assert.equal(existsSync("src/app/admin/tax/page.tsx"),false);
 assert.equal(existsSync("src/lib/tax/taxcloud-v3-server.ts"),false);
});
