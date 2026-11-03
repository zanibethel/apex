import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parsePrivateDestinationChargeSource,
 estimatePrivateDestinationCharges}
 from "../src/lib/checkout/admin-destination-charge.mjs";

const store="62000000-0000-0000-0000-000000000001";
const product="64000000-0000-0000-0000-000000000001";
const shipping={charge_shipping:true,flat_shipping_cents:795,
 free_shipping_min_subtotal_cents:10000};
const free={
 code:"FREESHIP",discount_kind:"free_shipping",discount_value:1,
 min_subtotal_cents:5000,is_active:true,starts_at:null,ends_at:null,
 usage_limit:null,redemption_count:0,
};
const baseline={
 schema_version:2,state:"private_shipping_charge_source",
 store_id:store,product_id:product,name:"Private product",currency:"USD",
 quantity:2,unit_price_cents:5000,observed_subtotal_cents:10000,
 quantity_available:0,shipping,requested_code:"",promotion_found:false,
 promotion:null,can_create_order:false,can_create_invoice:false,
 can_reserve_stock:false,can_pay:false,checkout_enabled:false,
};
const context={storeId:store,productId:product,quantity:2,code:""};
const parse=(data=baseline,ctx=context)=>
 parsePrivateDestinationChargeSource(data,ctx);
const estimate=(data=baseline,options={})=>
 estimatePrivateDestinationCharges(parse(data,{...context,
  code:data.requested_code}),{
  code:data.requested_code,expectedSubtotalCents:10000,...options,
 });
test("private saved-price source produces a total from merchandise and shipping",()=>{
 const r=estimate();
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseSubtotalCents,10000);
 assert.equal(r.shippingCents,0);
 assert.equal(r.totalCents,10000);
 assert.equal(r.quoteFinalized,false);
 assert.equal(r.canCreateInvoice,false);
 assert.equal(r.canCreateOrder,false);
 assert.equal(r.canPay,false);
 assert.equal(r.subtotalMatchesDisplay,true);
 assert.equal(Object.hasOwn(r,"taxStatus"),false);
 assert.equal(Object.hasOwn(r,"taxCents"),false);
});
test("valid percentage promo applies before shipping threshold",()=>{
 const p={...baseline,requested_code:"SAVE20",promotion_found:true,
  promotion:{...free,code:"SAVE20",discount_kind:"percentage",discount_value:20}};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseDiscountCents,2000);
 assert.equal(r.discountedMerchandiseCents,8000);
 assert.equal(r.shippingCents,795);
 assert.equal(r.freeShippingMinimumCents,10000);
 assert.equal(r.amountUntilFreeShippingCents,2000);
 assert.equal(r.totalCents,8795);
});
test("valid free-shipping code waives shipping but never merchandise",()=>{
 const p={...baseline,requested_code:"FREESHIP",promotion_found:true,
  promotion:free,shipping:{...shipping,free_shipping_min_subtotal_cents:20000}};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseDiscountCents,0);
 assert.equal(r.shippingDiscountCents,795);
 assert.equal(r.shippingCents,0);
 assert.equal(r.freeShippingMinimumCents,20000);
 assert.equal(r.amountUntilFreeShippingCents,10000);
 assert.equal(r.totalCents,10000);
 assert.equal(r.freeShippingReason,"discount_code");
});
test("unavailable and expired codes fail closed",()=>{
 const missing={...baseline,requested_code:"NOTFOUND"};
 assert.equal(estimate(missing).ok,false);
 const inactive={...baseline,requested_code:"FREESHIP",promotion_found:true,
  promotion:{...free,is_active:false}};
 assert.equal(estimate(inactive).ok,false);
 const expired={...baseline,requested_code:"FREESHIP",promotion_found:true,
  promotion:{...free,ends_at:"2021-01-01T00:00:00.000Z"}};
 assert.equal(estimate(expired).ok,false);
});
test("changed server price is used instead of stale displayed amount",()=>{
 const p={...baseline,unit_price_cents:6500,
  observed_subtotal_cents:13000};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.subtotalMatchesDisplay,false);
 assert.equal(r.merchandiseSubtotalCents,13000);
 assert.equal(r.totalCents,13000);
});
test("invalid privilege fields, tax payload and malformed amounts are rejected",()=>{
 for(const changed of [
  {can_pay:true},{can_create_invoice:true},{checkout_enabled:true},
  {can_create_order:true},{can_reserve_stock:true},
  {collect_sales_tax:false},{tax_cents:0},{tax_source:"not_configured"},
  {schema_version:1},{state:"private_destination_charge_source"},
  {store_id:"62000000-0000-0000-0000-000000000002"},
  {product_id:"64000000-0000-0000-0000-000000000002"},
  {quantity:3},{currency:"EUR"},{observed_subtotal_cents:9999},
  {shipping:{...shipping,charge_shipping:"true"}},
  {requested_code:"FREESHIP"},
  {promotion_found:true,promotion:null},
 ])assert.equal(parse({...baseline,...changed}),null,JSON.stringify(changed));
 assert.equal(estimatePrivateDestinationCharges(null,{
  code:"",expectedSubtotalCents:10000}),null);
});
test("shipping-only RPC, admin form and security CI contain no tax provider",()=>{
 const read=p=>readFileSync(p,"utf8");
 const sql=read("supabase/migrations/20261103223000_apex_shipping_only_checkout.sql");
 const action=read("src/app/admin/checkout-review/destination-charge-actions.ts");
 const ui=read("src/app/admin/checkout-review/admin-destination-charge-form.tsx");
 const workflow=read(".github/workflows/payout-rls.yml");
 const dbTest=read("tests/payout-rls/shipping-only-checkout.sql");
 assert.match(sql,/create or replace function public.get_admin_private_checkout_charge_source/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/'can_create_order',false/);
 assert.match(sql,/'can_create_invoice',false/);
 assert.match(sql,/revoke execute on function public.get_admin_private_checkout_rules_overview/);
 assert.match(action,/isVerifiedPlatformAdmin/);
 assert.match(action,/get_admin_private_checkout_charge_source/);
 assert.doesNotMatch(action,/destinationRegion|TaxCloud|providerTaxEstimate/);
 assert.match(ui,/Estimated total/);
 assert.doesNotMatch(ui,/Sales tax|TaxCloud|tax-provider|Final payable/);
 assert.match(workflow,/shipping-only-checkout.sql/);
 assert.match(dbTest,/Legacy product tax overview still callable/);
});
