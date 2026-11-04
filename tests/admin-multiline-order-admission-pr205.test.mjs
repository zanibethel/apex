import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 normalizeAdminAdmissionItems,parseAdminMultiLineLockedReadback,
 prepareAdminOrderAdmission,
} from "../src/lib/checkout/admin-multiline-order-admission.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const first="64000000-0000-0000-0000-000000000001";
const second="64000000-0000-0000-0000-000000000002";
const items=[{product_id:first,quantity:2},{product_id:second,quantity:1}];
const checks={
 supplier_requested:true,admin_clear:true,identity_clear:true,
 content_review_clear:true,product_setup_complete:true,
 supplier_authorized:true,product_authorized:false,public_release_enabled:false,
};
const source={
 schema_version:2,state:"locked_private_preflight",store_id:store,
 currency:"USD",total_units:3,observed_subtotal_cents:"14000",
 expected_subtotal_cents:"14000",subtotal_matches_display:true,
 lock_mode:"for_share_nowait",locks_persist_after_response:false,
 admission:"blocked",shipping_calculated:false,tax_calculated:false,
 can_quote:false,can_reserve_stock:false,can_create_order:false,
 can_create_invoice:false,can_pay:false,
 items:[
  {product_id:first,quantity:2,name:"Private catalog 1",sku:"A-1",
   currency:"USD",unit_price_cents:"5000",line_subtotal_cents:"10000",
   available_units:4,saved_price_valid:true,quantity_available:true,
   release_status_code:"product_authorization_unverified",
   release_checks:checks,can_order:false,can_pay:false},
  {product_id:second,quantity:1,name:"Private catalog 2",sku:"A-2",
   currency:"USD",unit_price_cents:"4000",line_subtotal_cents:"4000",
   available_units:0,saved_price_valid:true,quantity_available:false,
   release_status_code:"insufficient_available_stock",
   release_checks:checks,can_order:false,can_pay:false},
 ],
};
const shipping={
 charge_shipping:true,flat_shipping_cents:1500,medium_flat_shipping_cents:2580,
 free_shipping_min_subtotal_cents:20001,
};
const request=(options={})=>({
 readback:source,storeId:store,items,expectedSubtotalCents:14000,
 shippingPolicy:shipping,...options,
});
const read=path=>readFileSync(path,"utf8");

test("accepts only bounded unique product IDs and integer quantities",()=>{
 assert.deepEqual(normalizeAdminAdmissionItems(items),items);
 const bad=[
  [],[...items,items[0]],
  [{product_id:first,quantity:0}],
  [{product_id:first,quantity:11}],
  [{product_id:"demo-id",quantity:1}],
  [{product_id:first,quantity:1,price:1}],
  Array.from({length:9},(_,i)=>({product_id:"64000000-0000-0000-0000-"+
   String(i).padStart(12,"0"),quantity:1})),
  Array.from({length:6},(_,i)=>({product_id:"64000000-0000-0000-0000-"+
   String(i).padStart(12,"0"),quantity:10})),
 ];
 for(const invalid of bad)assert.equal(normalizeAdminAdmissionItems(invalid),null);
});

test("locked multi-line readback verifies exact price, quantities, inventory and release checks",()=>{
 const result=parseAdminMultiLineLockedReadback(source,store,items,14000);
 assert.ok(result);
 assert.equal(result.subtotalCents,14000);
 assert.equal(result.allPricesValid,true);
 assert.equal(result.allStockVerified,false);
 assert.equal(result.allPrereqsMet,false);
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].availableUnits,4);
 assert.equal(result.items[0].lineTotalCents,10000);
 assert.equal(result.items[1].stockSufficient,false);
 assert.equal(result.canCreateOrder,false);
 assert.equal(result.canPay,false);
 assert.equal(result.locksPersistAfterResponse,false);
});

test("saved USPS rates are reviewed across multiple products without checkout rights",()=>{
 const small=prepareAdminOrderAdmission(request());
 const medium=prepareAdminOrderAdmission(request({boxSize:"medium"}));
 assert.equal(small.ok,true);
 assert.equal(small.status,"private_order_review");
 assert.equal(small.totals.merchandiseSubtotalCents,14000);
 assert.equal(small.totals.shippingCents,1500);
 assert.equal(small.totals.totalCents,15500);
 assert.equal(medium.totals.shippingCents,2580);
 assert.equal(medium.totals.totalCents,16580);
 assert.equal(small.canCreateOrder,false);
 assert.equal(small.canReserveStock,false);
 assert.equal(small.canCreateInvoice,false);
 assert.equal(small.canPay,false);
});

test("discounts apply before the strict $200.01 free-shipping threshold",()=>{
 const one={...source.items[0],quantity:1,unit_price_cents:"22000",
  line_subtotal_cents:"22000"};
 const row={...source,total_units:1,observed_subtotal_cents:"22000",
  expected_subtotal_cents:"22000",items:[one]};
 const cart=[{product_id:first,quantity:1}];
 const noCode=prepareAdminOrderAdmission(request({
  readback:row,items:cart,expectedSubtotalCents:22000,
 }));
 assert.equal(noCode.totals.shippingCents,0);
 const promo={
  code:"SAVE10",is_active:true,discount_kind:"percentage",discount_value:10,
  min_subtotal_cents:0,starts_at:null,ends_at:null,
  usage_limit:null,redemption_count:0,
 };
 const discounted=prepareAdminOrderAdmission(request({
  readback:row,items:cart,expectedSubtotalCents:22000,
  promotion:promo,code:"SAVE10",
 }));
 assert.equal(discounted.ok,true);
 assert.equal(discounted.totals.discountedMerchandiseCents,19800);
 assert.equal(discounted.totals.shippingCents,1500);
 assert.equal(discounted.totals.totalCents,21300);
 assert.equal(prepareAdminOrderAdmission(request({
  readback:row,items:cart,expectedSubtotalCents:22000,
  code:"MISSING",
 })).ok,false);
});

test("tampered RPC rights, stale totals and stock inconsistencies fail closed",()=>{
 const bad=[
  {...source,can_pay:true},
  {...source,can_create_invoice:true},
  {...source,can_create_order:true},
  {...source,can_reserve_stock:true},
  {...source,admission:"allowed"},
  {...source,locks_persist_after_response:true},
  {...source,lock_mode:"none"},
  {...source,items:[source.items[0]]},
  {...source,items:[source.items[0],source.items[0]]},
  {...source,items:[{...source.items[0],unit_price_cents:"5500"},source.items[1]]},
  {...source,items:[{...source.items[0],available_units:1},source.items[1]]},
  {...source,items:[{...source.items[0],can_order:true},source.items[1]]},
  {...source,items:[{...source.items[0],release_checks:{
   ...checks,product_authorized:"true"}},source.items[1]]},
  {...source,items:[{...source.items[0],unit_price_cents:"999999999"},source.items[1]]},
 ];
 for(const value of bad){
  assert.equal(parseAdminMultiLineLockedReadback(value,store,items,14000),null,
   JSON.stringify(value).slice(0,130));
 }
 const stale={...source,observed_subtotal_cents:"15000",
  subtotal_matches_display:false,
  items:[{...source.items[0],unit_price_cents:"5500",
   line_subtotal_cents:"11000"},source.items[1]]};
 const parsed=parseAdminMultiLineLockedReadback(stale,store,items,14000);
 assert.equal(parsed.subtotalMatchesDisplay,false);
 assert.equal(prepareAdminOrderAdmission(request({readback:stale})).ok,false);
});

test("invalid pricing reports blocked status and never generates a purchase total",()=>{
 const withoutPrice={...source,observed_subtotal_cents:"4000",
  expected_subtotal_cents:"4000",items:[
   {...source.items[0],saved_price_valid:false,unit_price_cents:null,
    line_subtotal_cents:null},source.items[1],
  ]};
 const r=prepareAdminOrderAdmission(request({
  readback:withoutPrice,expectedSubtotalCents:4000,
 }));
 assert.equal(r.ok,true);
 assert.equal(r.status,"price_unavailable");
 assert.equal(r.totals,null);
 assert.equal(r.canCreateOrder,false);
});

test("admin route and action require signed-in admin, locked DB verification and no writes",()=>{
 const page=read("src/app/admin/order-admission/page.tsx");
 const action=read("src/app/admin/order-admission/actions.ts");
 const screen=read("src/app/admin/order-admission/order-admission-workspace.tsx");
 const dashboard=read("src/app/admin/page.tsx");
 assert.match(page,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/eq\("store_id",STORE_ID\)/);
 assert.match(action,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(action,/get_admin_private_cart_validation/);
 assert.match(action,/get_admin_locked_cart_preflight/);
 assert.match(action,/p_expected_subtotal_cents:expected/);
 assert.match(action,/prepareAdminOrderAdmission/);
 assert.match(action,/supplier_discount_codes/);
 assert.match(action,/apex_store_shipping_settings/);
 assert.doesNotMatch(action,/\.insert\(|\.update\(|\.delete\(|service_role|createInvoice\(|createOrder\(/);
 assert.match(screen,/No order or invoice was created|No order was placed|Order is not submitted/);
 assert.match(screen,/name="boxSize"/);
 assert.match(screen,/name="code"/);
 assert.match(screen,/name="items"/);
 assert.match(dashboard,/href: "\/admin\/order-admission"/);
});
