import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 CUSTOMER_CART_STORAGE_KEY,normalizeCartSelections,parseSavedCart,
 saveCartPayload,changeCartItem,cartCount,buildCartReview,
} from "../src/lib/cart/customer-cart.mjs";

const p1="64000000-0000-0000-0000-000000000001";
const p2="64000000-0000-0000-0000-000000000002";
const selected=[{product_id:p1,quantity:1}];
const shipping={
 charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,envelope_max_items:4,
};
const source={
 schema_version:1,state:"rechecked_inventory_cart",
 items:[{product_id:p1,quantity:1,name:"Catalog item",
  unit_price_cents:"20000",availability:"sold_out",can_checkout:false}],
 shipping,requested_code:"",promotion:null,
 can_place_order:false,can_create_invoice:false,can_reserve_stock:false,
 can_pay:false,
};
const promo={
 code:"SAVE10",is_active:true,discount_kind:"percentage",discount_value:10,
 min_subtotal_cents:0,starts_at:null,ends_at:null,usage_limit:null,redemption_count:0,
};
const read=p=>readFileSync(p,"utf8");
const quote=(s=source,o={})=>buildCartReview(s,{items:selected,...o});

test("cart stores only bounded real UUID product IDs and quantities",()=>{
 const saved=saveCartPayload(selected);
 assert.equal(CUSTOMER_CART_STORAGE_KEY,"apex_customer_cart_v1");
 assert.deepEqual(parseSavedCart(saved),selected);
 assert.deepEqual(parseSavedCart("not json"),[]);
 assert.deepEqual(parseSavedCart(JSON.stringify({version:5,items:selected})),[]);
 assert.deepEqual(normalizeCartSelections([{product_id:"demo-shirt",quantity:1}]),[]);
 assert.deepEqual(normalizeCartSelections([...selected,...selected]),[]);
 assert.deepEqual(normalizeCartSelections([{...selected[0],unitPriceCents:1}]),[]);
 assert.deepEqual(normalizeCartSelections([{product_id:p1,quantity:11}]),[]);
 assert.deepEqual(normalizeCartSelections(Array.from({length:21},(_,i)=>({
  product_id:"64000000-0000-0000-0000-"+String(i).padStart(12,"0"),quantity:1,
 }))),[]);
});

test("quantity edits, removal and cart count remain deterministic",()=>{
 const two=changeCartItem(selected,p2,3);
 assert.equal(cartCount(two),4);
 assert.deepEqual(changeCartItem(two,p2,0),selected);
 assert.equal(changeCartItem(selected,p1,0).length,0);
 assert.deepEqual(changeCartItem(selected,p1,11),selected);
 assert.deepEqual(changeCartItem(selected,"demo-shirt",1),selected);
});

test("server-priced padded envelope is charged at exactly $200, free above",()=>{
 const r=quote();
 assert.equal(r.ok,true);
 assert.equal(r.status,"unavailable_stock");
 assert.equal(r.shippingCents,1500);
 assert.equal(r.totalCents,21500);
 assert.equal(r.canPlaceOrder,false);
 assert.equal(r.canPay,false);
 assert.equal(r.items[0].name,"Catalog item");
 assert.equal(r.items[0].availability,"sold_out");
 const extra={...source,items:[{...source.items[0],unit_price_cents:"20001"}]};
 const free=quote(extra);
 assert.equal(free.ok,true);
 assert.equal(free.shippingCents,0);
 assert.equal(free.totalCents,20001);
});

test("Medium shipping and discount code use authoritative post-discount total",()=>{
 const withPromo={...source,
  items:[{...source.items[0],unit_price_cents:"22000"}],
  requested_code:"SAVE10",promotion:promo};
 const padded=quote(withPromo,{code:"SAVE10"});
 const medium=quote(withPromo,{code:"SAVE10",boxSize:"medium"});
 assert.equal(padded.ok,true);
 assert.equal(padded.merchandiseDiscountCents,2200);
 assert.equal(padded.discountedMerchandiseCents,19800);
 assert.equal(padded.shippingCents,1500);
 assert.equal(medium.shippingCents,2580);
 assert.equal(medium.totalCents,22380);
 assert.equal(medium.amountUntilFreeShippingCents,201);
 const waived={...source,requested_code:"SHIPFREE",promotion:{
  ...promo,code:"SHIPFREE",discount_kind:"free_shipping",discount_value:1,
 }};
 assert.equal(quote(waived,{code:"SHIPFREE",boxSize:"medium"}).shippingCents,0);
});

test("invalid or unverified stock, pricing, privileges and codes are rejected",()=>{
 for(const obj of [
  {state:"catalog_unavailable",items:[]},
  {state:"cart_unavailable",items:[]},
  {can_pay:true},{can_place_order:true},
  {can_create_invoice:true},{can_reserve_stock:true},
  {items:[{...source.items[0],availability:"invented"}]},
  {items:[{...source.items[0],can_checkout:true}]},
  {items:[{...source.items[0],unit_price_cents:"0"}]},
  {items:[{...source.items[0],quantity:2}]},
  {items:[{...source.items[0],product_id:p2}]},
  {items:[{...source.items[0],source_cost_cents:500}]},
  {shipping:{...shipping,flat_shipping_cents:-1}},
  {promotion:promo},
 ])assert.equal(quote({...source,...obj}).ok,false,JSON.stringify(obj));
 assert.equal(quote(source,{boxSize:"large"}).ok,false);
 assert.equal(quote(source,{code:"SAVE10"}).ok,false);
});

test("public cart code exposes no private credentials or order creation",()=>{
 const api=read("src/app/api/cart/quote/route.ts");
 const migration=read("supabase/migrations/20261104090000_apex_public_cart_quote_source.sql");
 const retailMigration=read("supabase/migrations/20261114010000_apex_retail_cart_quote_bridge.sql");
 const page=read("src/app/cart/customer-cart-page.tsx");
 const layout=read("src/app/layout.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(api,/normalizeCartSelections/);
 assert.match(api,/buildCartReview/);
 assert.match(api,/get_public_retail_cart_quote_source/);
 assert.doesNotMatch(api,/APEX_PUBLIC_SOLD_OUT_CATALOG/);
 assert.match(api,/cache:"no-store"/);
 assert.doesNotMatch(api,/service_role|createInvoice|insertOrder|createOrderIntent/);
 assert.match(migration,/private_release_gate/);
 assert.match(retailMigration,/retail_showcase_gate/);
 assert.match(retailMigration,/get_public_retail_cart_quote_source/);
 assert.match(retailMigration,/can_place_order\x27,false/);
 assert.match(migration,/inv.quantity_on_hand=0 and inv.quantity_reserved=0/);
 assert.match(migration,/can_place_order',false/);
 assert.match(migration,/revoke all on function public.get_public_cart_quote_source/);
 assert.doesNotMatch(migration,/update public\.products|update public\.stores|\\bcreate\\s+invoice\\b|insert into apex_internal/);
 assert.match(layout,/CustomerCartProvider/);
 assert.match(shelf,/SaveCatalogItem/);
 assert.match(page,/checkout" disabled|apex-customer-checkout" disabled/);
 assert.match(workflow,/public-cart-quote-source.sql/);
});
