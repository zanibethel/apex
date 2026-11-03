import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeReviewDestination,
 parsePrivateDestinationChargeSource,estimatePrivateDestinationCharges}
 from "../src/lib/checkout/admin-destination-charge.mjs";

const store="62000000-0000-0000-0000-000000000001";
const product="64000000-0000-0000-0000-000000000001";
const shipping={charge_shipping:true,flat_shipping_cents:795,
 free_shipping_min_subtotal_cents:10000};
const promotional={
 code:"FREESHIP",discount_kind:"free_shipping",discount_value:1,
 min_subtotal_cents:5000,is_active:true,
 starts_at:null,ends_at:null,usage_limit:null,redemption_count:0,
};
const baseline={
 schema_version:1,state:"private_destination_charge_source",
 store_id:store,product_id:product,name:"Private product",
 currency:"USD",quantity:2,unit_price_cents:5000,
 observed_subtotal_cents:10000,collect_sales_tax:true,
 quantity_available:0,shipping,
 requested_code:"",promotion_found:false,promotion:null,
 tax_source:"not_configured",tax_cents:null,total_cents:null,
 can_quote_final_total:false,can_create_order:false,
 can_create_invoice:false,can_reserve_stock:false,can_pay:false,
 checkout_enabled:false,
};
const context={storeId:store,productId:product,quantity:2,code:""};
const dest=normalizeReviewDestination(" tx ","79401");
const parse=(data=baseline,ctx=context)=>
 parsePrivateDestinationChargeSource(data,ctx);
const estimate=(data=baseline,opts={})=>
 estimatePrivateDestinationCharges(parse(data,{...context,
  code:data.requested_code}),{destination:dest,
  code:data.requested_code,expectedSubtotalCents:10000,...opts});

test("valid U.S. location syntax is not a verified sales tax jurisdiction",()=>{
 assert.deepEqual(dest,{region:"TX",postalCode:"79401",jurisdictionVerified:false});
 assert.equal(normalizeReviewDestination("XX","79401"),null);
 assert.equal(normalizeReviewDestination("TX","letters"),null);
 assert.equal(normalizeReviewDestination("TX",""),null);
 assert.equal(normalizeReviewDestination("TX","79401-1234").postalCode,"79401-1234");
});
test("live product price and no-code policy generates no tax, final quote, invoice or order",()=>{
 const r=estimate();
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseSubtotalCents,10000);
 assert.equal(r.shippingCents,0);
 assert.equal(r.preTaxTotalCents,10000);
 assert.equal(r.provisionalTaxableCents,10000);
 assert.equal(r.taxCents,null);
 assert.equal(r.finalTotalCents,null);
 assert.equal(r.destinationVerified,false);
 assert.equal(r.quoteFinalized,false);
 assert.equal(r.canPay,false);
 assert.equal(r.canCreateOrder,false);
 assert.equal(r.canCreateInvoice,false);
 assert.equal(r.subtotalMatchesDisplay,true);
 assert.equal(r.freeShippingReason,"subtotal_threshold");
});
test("saved fee, threshold and discount are calculated after merchandise savings",()=>{
 const p={...baseline,promotion_found:true,requested_code:"SAVE20",
  promotion:{...promotional,code:"SAVE20",discount_kind:"percentage",
   discount_value:20}};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseDiscountCents,2000);
 assert.equal(r.discountedMerchandiseCents,8000);
 assert.equal(r.shippingCents,795);
 assert.equal(r.preTaxTotalCents,8795);
 assert.equal(r.freeShippingReason,"none");
});
test("an eligible saved free-shipping code waives only shipping, never product or tax",()=>{
 const p={...baseline,observed_subtotal_cents:10000,
  requested_code:"FREESHIP",promotion_found:true,promotion:promotional,
  shipping:{...shipping,free_shipping_min_subtotal_cents:20000}};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.merchandiseDiscountCents,0);
 assert.equal(r.shippingDiscountCents,795);
 assert.equal(r.shippingCents,0);
 assert.equal(r.freeShippingReason,"discount_code");
 assert.equal(r.provisionalTaxableCents,10000);
 assert.equal(r.taxCents,null);
 assert.equal(r.finalTotalCents,null);
});
test("unknown, expired and inactive promotion codes fail closed",()=>{
 const missing={...baseline,requested_code:"NOTFOUND",promotion_found:false,promotion:null};
 assert.deepEqual(estimate(missing),{
  ok:false,message:"Promotion code not found for this private store."});
 const inactive={...baseline,requested_code:"FREESHIP",promotion_found:true,
  promotion:{...promotional,is_active:false}};
 assert.equal(estimate(inactive).ok,false);
 const expired={...baseline,requested_code:"FREESHIP",promotion_found:true,
  promotion:{...promotional,ends_at:"2021-01-01T00:00:00.000Z"}};
 assert.equal(estimate(expired).ok,false);
});
test("changed stored price is detected as stale while estimate uses new saved amount",()=>{
 const p={...baseline,unit_price_cents:6500,observed_subtotal_cents:13000};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.subtotalMatchesDisplay,false);
 assert.equal(r.merchandiseSubtotalCents,13000);
 assert.equal(r.preTaxTotalCents,13000);
});
test("unchecked tax flags yield only provisional tax base, not exemption proof",()=>{
 const p={...baseline,collect_sales_tax:false};
 const r=estimate(p);
 assert.equal(r.ok,true);
 assert.equal(r.provisionalTaxableCents,0);
 assert.equal(r.taxStatus,"awaiting_verified_destination_quote");
 assert.equal(r.finalTotalCents,null);
});
test("strict RPC parser rejects privilege changes, supplied final tax, and mismatched data",()=>{
 for(const modified of [
  {can_pay:true},{can_create_invoice:true},{can_quote_final_total:true},
  {can_create_order:true},{can_reserve_stock:true},{checkout_enabled:true},
  {tax_cents:0},{total_cents:10000},{tax_source:"verified"},
  {store_id:"62000000-0000-0000-0000-000000000002"},
  {product_id:"64000000-0000-0000-0000-000000000002"},
  {collect_sales_tax:null},{currency:"EUR"}, {quantity:3},
  {observed_subtotal_cents:9999},
  {shipping:{...shipping,charge_shipping:"true"}},
  {promotion_found:true,promotion:null},{requested_code:"FREESHIP"},
 ])assert.equal(parse({...baseline,...modified}),null,JSON.stringify(modified));
 assert.equal(estimatePrivateDestinationCharges(null,{destination:dest,code:"",expectedSubtotalCents:10000}),null);
});
test("private action, migration and CI never add a public checkout or tax-rate guess",()=>{
 const read=p=>readFileSync(p,"utf8");
 const sql=read("supabase/migrations/20261103210000_apex_private_destination_charge_source.sql");
 const action=read("src/app/admin/checkout-review/destination-charge-actions.ts");
 const ui=read("src/app/admin/checkout-review/admin-destination-charge-form.tsx");
 const workflow=read(".github/workflows/payout-rls.yml");
 const testSql=read("tests/payout-rls/admin-destination-charge-source.sql");
 const layout=read("src/app/admin/checkout-review/checkout-catalog-review.tsx");
 assert.match(sql,/security definer/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/revoke all on function public.get_admin_private_checkout_charge_source/);
 assert.match(sql,/'tax_source','not_configured'/);
 assert.match(sql,/'can_quote_final_total',false/);
 assert.doesNotMatch(sql,/\b(?:insert into|update|delete from)\s+(?:public\.products|apex_internal\.checkout_order_intents|apex_internal\.btcpay_invoice_post_intents)/i);
 assert.match(action,/isVerifiedPlatformAdmin/);
 assert.match(action,/auth.getUser\(\)/);
 assert.match(action,/get_admin_private_checkout_charge_source/);
 assert.match(ui,/Final total/);
 assert.match(ui,/Awaiting verified destination quote/);
 assert.match(layout,/AdminDestinationChargeForm/);
 assert.match(workflow,/admin-destination-charge-source\.sql/);
 assert.match(testSql,/Anonymous private price quote accepted/);
 assert.match(testSql,/Forged supplier admin could quote private prices/);
 assert.match(testSql,/Cross-store quote accepted/);
 assert.match(testSql,/Saved changed price\/tax\/shipping\/promo was not observed/);
});
