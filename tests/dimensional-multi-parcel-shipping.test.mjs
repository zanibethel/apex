import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {estimateFlatRatePackages,validPackedProfile}
 from "../src/lib/commerce/flat-rate-package-estimate.mjs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";
const read=p=>readFileSync(p,"utf8");
const a="64000000-0000-4000-8000-000000000001";
const b="64000000-0000-4000-8000-000000000002";
const policy={charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,
 free_shipping_min_subtotal_cents:20001,envelope_max_items:4};
const product=(product_id,length_mm,width_mm,height_mm,weight_g,flexible)=>
 ({product_id,length_mm,width_mm,height_mm,weight_g,flexible});
const sticker=product(a,100,75,12,140,true);
const bottle=product(b,270,210,130,1700,false);
const items=(quantity=1,id=a)=>[{productId:id,quantity}];
const source=(lines,profiles,code="",promo=null)=>({
 schema_version:2,state:"rechecked_inventory_cart",
 items:lines.map(l=>({product_id:l.productId,name:"Test product",
  quantity:l.quantity,unit_price_cents:"1499",availability:"in_stock",can_checkout:false})),
 shipping:policy,shipping_profiles:profiles,
 requested_code:code,promotion:promo,
 can_place_order:false,can_create_invoice:false,can_reserve_stock:false,can_pay:false,
});
const review=(lines,profiles,code="",promo=null)=>
 buildCartReview(source(lines,profiles,code,promo),{
  items:lines.map(l=>({product_id:l.productId,quantity:l.quantity})),
  code,boxSize:"auto",
 });
test("profile shape, dimensions, weight and ID are strict",()=>{
 assert.equal(validPackedProfile(sticker),true);
 assert.equal(validPackedProfile({...sticker,weight_g:0}),false);
 assert.equal(validPackedProfile({...sticker,length_mm:2001}),false);
 assert.equal(validPackedProfile({...sticker,source_cost:10}),false);
 assert.equal(validPackedProfile({...sticker,flexible:"yes"}),false);
});
test("soft item qualifies for one padded envelope and preserves configured fee",()=>{
 const r=estimateFlatRatePackages(items(4),[sticker],policy);
 assert.equal(r.ok,true);
 assert.equal(r.packageCount,1);
 assert.equal(r.originalShippingCents,1500);
 assert.deepEqual(r.shippingPackages.map(p=>p.kind),["padded_envelope"]);
 assert.equal(review(items(4),[sticker]).shippingCents,1500);
});
test("large rigid units each occupy a medium box; never charge only one box",()=>{
 const r=estimateFlatRatePackages(items(10,b),[bottle],policy);
 assert.equal(r.ok,true);
 assert.equal(r.packageCount,10);
 assert.equal(r.originalShippingCents,25800);
 assert.ok(r.shippingPackages.every(p=>p.kind==="medium_box"));
 const q=review(items(10,b),[bottle]);
 assert.equal(q.ok,true);
 assert.equal(q.shippingPackageCount,10);
 assert.equal(q.shippingEstimateStatus,"dimensional_estimate");
 assert.equal(q.shippingCents,25800);
 assert.equal(q.totalCents,14990+25800);
 assert.equal(q.canPay,false);
 assert.equal(q.canPlaceOrder,false);
});
test("mixed flexible and rigid items select multiple parcels with correct fees",()=>{
 const r=estimateFlatRatePackages([items(3)[0],items(2,b)[0]],
 [sticker,bottle],policy);
 assert.equal(r.ok,true);
 assert.equal(r.packageCount,3);
 assert.equal(r.originalShippingCents,6660);
 assert.equal(r.shippingPackages.filter(x=>x.kind==="medium_box").length,2);
 assert.equal(r.shippingPackages.filter(x=>x.kind==="padded_envelope").length,1);
});
test("both USPS Medium box internal variants are supported",()=>{
 const wide=product(b,320,270,50,500,false);
 const r=estimateFlatRatePackages(items(1,b),[wide],policy);
 assert.equal(r.ok,true);
 assert.equal(r.shippingPackages[0].variant,"B");
 assert.equal(r.originalShippingCents,2580);
});
test("oversize items or weights cannot silently undercharge",()=>{
 const oversize=product(a,1000,800,300,5000,false);
 assert.equal(estimateFlatRatePackages(items(),[oversize],policy).reason,"oversize");
 assert.equal(review(items(),[oversize]).ok,false);
 assert.match(review(items(),[oversize]).reason,/different shipping package/i);
 const heavy=product(a,100,100,100,32000,false);
 assert.equal(estimateFlatRatePackages(items(),[heavy],policy).reason,"invalid_profiles");
});
test("unmeasured products stay visibly provisional without invented values",()=>{
 const r=review(items(3),[null]);
 assert.equal(r.ok,true);
 assert.equal(r.shippingEstimateStatus,"provisional_missing_dimensions");
 assert.equal(r.shippingPackageCount,null);
 assert.equal(r.shippingCents,1500); // Existing quantity-based rate until measurements saved.
 const mixed=review([items(2)[0],items(1,b)[0]],[sticker,null]);
 assert.equal(mixed.ok,true);
 assert.equal(mixed.shippingEstimateStatus,"provisional_missing_dimensions");
});
test("promo and >$200 free shipping waive the SUM of multiple package fees",()=>{
 const list=items(10,b);
 const discount={code:"SHIPFREE",is_active:true,discount_kind:"free_shipping",discount_value:1,
  min_subtotal_cents:0,starts_at:null,ends_at:null,usage_limit:null,redemption_count:0};
 const r=review(list,[bottle],"SHIPFREE",discount);
 assert.equal(r.ok,true);
 assert.equal(r.shippingCents,0);
 assert.equal(r.totalCents,14990);
 assert.equal(r.shippingPackageCount,10);
 const expensive=source(list,[bottle]);
 expensive.items[0].unit_price_cents="3000"; // 10 units -> $300
 const q=buildCartReview(expensive,{items:[{product_id:b,quantity:10}],boxSize:"auto"});
 assert.equal(q.ok,true);
 assert.equal(q.shippingCents,0);
 assert.equal(q.totalCents,30000);
 assert.equal(q.shippingPackageCount,10);
});
test("v2 endpoint and authenticated supplier profile cannot create orders or enable payments",()=>{
 const api=read("src/app/api/cart/quote/route.ts");
 const migration=read("supabase/migrations/20261114214000_apex_supplier_dimensional_shipping_profiles_v2.sql");
 const supplier=read("src/app/supplier/shipping/profile-actions.ts");
 const page=read("src/app/supplier/shipping/page.tsx");
 const mini=read("src/app/cart/cart-provider.tsx");
 const full=read("src/app/cart/customer-cart-page.tsx");
 assert.match(api,/get_public_retail_cart_quote_source_v2/);
 assert.match(migration,/get_public_retail_cart_quote_source\(/);
 assert.match(migration,/grant execute on function public\.get_public_retail_cart_quote_source_v2/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/to authenticated using/);
 assert.match(migration,/shipping_profile_owner_insert/);
 assert.match(migration,/shipping_profile_owner_update/);
 assert.match(migration,/shipping_profile_owner_delete/);
 assert.match(migration,/apex_shipping_profiles_audit/);
 assert.match(supplier,/getUser\(\)/);
 assert.match(supplier,/memberships|supplier_memberships/);
 assert.match(supplier,/updated_at",expected/);
 assert.match(supplier,/process\.env\.APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(page,/ProductShippingProfileForm/);
 assert.match(mini,/provisional_missing_dimensions/);
 assert.match(full,/shippingPackageCount/);
 assert.doesNotMatch(api+migration+supplier,/createInvoice|BTCPay|enable.*retail_order_engine_gate|purchaseLabel/);
});
