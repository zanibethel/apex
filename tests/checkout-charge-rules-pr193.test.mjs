import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteDiscount} from "../src/lib/commerce/discount-quote.mjs";
import {quoteOptionalShipping,previewCheckoutCharges} from "../src/lib/commerce/checkout-charge-rules.mjs";
import {parseCheckoutRulesOverview} from "../src/lib/commerce/checkout-rule-overview.mjs";

const id1="64000000-0000-0000-0000-000000000001";
const id2="64000000-0000-0000-0000-000000000002";
const store="62000000-0000-0000-0000-000000000001";
const shipping={charge_shipping:true,flat_shipping_cents:795,
 free_shipping_min_subtotal_cents:9000};
const lines=[
 {productId:id1,quantity:1,unitPriceCents:6000,collectSalesTax:true},
 {productId:id2,quantity:1,unitPriceCents:4000,collectSalesTax:false},
];
const code=(kind,value,minimum=0)=>({
 code:"TESTCODE",is_active:true,discount_kind:kind,
 discount_value:value,min_subtotal_cents:minimum,
 starts_at:null,ends_at:null,usage_limit:null,redemption_count:0,
});
const read=path=>readFileSync(path,"utf8");
test("tax checkbox excludes unchecked products from provisional taxable base",()=>{
 const result=previewCheckoutCharges({lines,shippingPolicy:shipping});
 assert.equal(result.ok,true);
 assert.equal(result.merchandiseSubtotalCents,10000);
 assert.equal(result.taxableMerchandiseCents,6000);
 assert.equal(result.untaxedMerchandiseCents,4000);
 assert.equal(result.shippingCents,0);
 assert.equal(result.freeShippingReason,"subtotal_threshold");
 assert.equal(result.taxCents,null);
 assert.equal(result.totalCents,null);
 assert.equal(result.taxVerificationRequired,true);
 assert.equal(result.canPlaceOrder,false);
 assert.equal(result.canCreateInvoice,false);
});
test("discounts are evaluated before the free-shipping threshold",()=>{
 const percent=previewCheckoutCharges({
  lines,shippingPolicy:shipping,discountCode:code("percentage",10),
 });
 assert.equal(percent.merchandiseDiscountCents,1000);
 assert.equal(percent.discountedMerchandiseCents,9000);
 assert.equal(percent.taxableMerchandiseCents,5400);
 assert.equal(percent.shippingCents,0);
 const fixed=previewCheckoutCharges({
  lines,shippingPolicy:shipping,discountCode:code("fixed",2000),
 });
 assert.equal(fixed.merchandiseDiscountCents,2000);
 assert.equal(fixed.discountedMerchandiseCents,8000);
 assert.equal(fixed.taxableMerchandiseCents,4800);
 assert.equal(fixed.shippingCents,795);
 assert.equal(fixed.preTaxTotalCents,8795);
 assert.equal(fixed.freeShippingReason,"none");
});
test("free-shipping promotion waives only shipping, not merchandise or tax",()=>{
 const free=code("free_shipping",1,5000);
 const discount=quoteDiscount(free,8000);
 assert.equal(discount.eligible,true);
 assert.equal(discount.discountCents,0);
 assert.equal(discount.totalCents,8000);
 assert.equal(discount.freeShipping,true);
 const result=previewCheckoutCharges({
  lines,shippingPolicy:shipping,discountCode:free,
 });
 assert.equal(result.merchandiseDiscountCents,0);
 assert.equal(result.shippingDiscountCents,795);
 assert.equal(result.shippingCents,0);
 assert.equal(result.freeShippingReason,"discount_code");
 assert.equal(result.taxableMerchandiseCents,6000);
 assert.equal(result.totalCents,null);
 assert.equal(quoteDiscount(code("free_shipping",99),10000).eligible,false);
 assert.equal(quoteDiscount(code("free_shipping",1,12000),10000).eligible,false);
 assert.equal(quoteDiscount({...free,usage_limit:1,redemption_count:1},10000).eligible,false);
});
test("shipping can be turned off and rejects invalid configurations",()=>{
 const noShipping={charge_shipping:false,flat_shipping_cents:0,
  free_shipping_min_subtotal_cents:null};
 assert.equal(quoteOptionalShipping(noShipping,500,false).shippingCents,0);
 assert.equal(quoteOptionalShipping(noShipping,500,true).shippingCents,0);
 assert.equal(quoteOptionalShipping({...noShipping,flat_shipping_cents:795},500),null);
 assert.equal(quoteOptionalShipping({...noShipping,
  free_shipping_min_subtotal_cents:0},500),null);
 assert.equal(quoteOptionalShipping({...shipping,flat_shipping_cents:-1},500),null);
});
test("incomplete product tax info and malformed amounts fail closed",()=>{
 assert.equal(previewCheckoutCharges({lines:[{...lines[0],collectSalesTax:null}],
  shippingPolicy:shipping}).ok,false);
 assert.equal(previewCheckoutCharges({lines:[lines[0],lines[0]],
  shippingPolicy:shipping}).ok,false);
 assert.equal(previewCheckoutCharges({lines:[{...lines[0],unitPriceCents:0}],
  shippingPolicy:shipping}).ok,false);
 assert.equal(previewCheckoutCharges({lines,shippingPolicy:undefined}).ok,false);
});
test("admin checkout overview requires exact products and a safe shipping policy",()=>{
 const value={store_id:store,store_name:"Private store",
  checkout_enabled:false,shipping,products:[
   {id:id1,name:"Product A",sku:"A",collect_sales_tax:true},
   {id:id2,name:"Product B",sku:"B",collect_sales_tax:false},
  ]};
 const result=parseCheckoutRulesOverview(value,store);
 assert.ok(result);
 assert.deepEqual(result.products.map(x=>x.collectSalesTax),[true,false]);
 assert.equal(parseCheckoutRulesOverview({...value,checkout_enabled:true},store),null);
 assert.equal(parseCheckoutRulesOverview({...value,products:[
  {...value.products[0],collect_sales_tax:null}]},store),null);
 assert.equal(parseCheckoutRulesOverview({...value,products:[
  value.products[0],value.products[0]]},store),null);
});
test("new product checkbox and bulk admin/supplier actions remain private",()=>{
 const migration=read("supabase/migrations/20261103193000_apex_private_checkout_charge_settings.sql");
 const testSql=read("tests/payout-rls/private-checkout-charge-settings.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 const bulk=read("src/app/supplier/catalog/bulk-editor.tsx");
 const actions=read("src/app/supplier/checkout-rules/actions.ts");
 const admin=read("src/app/admin/checkout-rules/page.tsx");
 const promotions=read("src/app/supplier/discounts/actions.ts");
 const form=read("src/app/supplier/discounts/forms.tsx");
 assert.match(migration,/collect_sales_tax boolean not null default true/);
 assert.match(migration,/set_bulk_product_tax_collection/);
 assert.match(migration,/apex_product_tax_setting_events/);
 assert.match(migration,/apex_shipping_setting_events/);
 assert.match(migration,/supplier_memberships/);
 assert.match(migration,/app_metadata,apex_role/);
 assert.match(migration,/check\(discount_kind in \('percentage','fixed','free_shipping'\)\)/);
 assert.match(migration,/checkout_enabled',false/);
 assert.doesNotMatch(migration,/\b(?:update|insert into)\s+apex_internal\.checkout_order_intents\b/i);
 assert.match(testSql,/Anonymous tax update allowed/);
 assert.match(testSql,/Unassigned supplier forged tax update/);
 assert.match(testSql,/Duplicate bulk product IDs accepted/);
 assert.match(testSql,/Shipping disabled but fee not zero/);
 assert.match(testSql,/Free shipping accepted a merchandise amount/);
 assert.match(workflow,/private-checkout-charge-settings\.sql/);
 assert.match(bulk,/Collect sales tax on selected/);
 assert.match(bulk,/Do not collect sales tax on selected/);
 assert.match(bulk,/Collect sales tax for /);
 assert.match(actions,/auth.getUser\(\)/);
 assert.match(actions,/set_bulk_product_tax_collection/);
 assert.match(actions,/save_private_store_shipping_settings/);
 assert.match(admin,/isVerifiedPlatformAdmin/);
 assert.match(promotions,/quoteOptionalShipping/);
 assert.match(form,/value="free_shipping"/);
});
