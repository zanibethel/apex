import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";

const read=path=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/20261105094500_apex_public_cart_optional_shipping_quote.sql");
const previous=read("supabase/migrations/20261104103000_apex_inventory_aware_catalog.sql");
const selectFunction=sql=>sql.slice(
 sql.indexOf("create or replace function public.get_public_cart_quote_source("),
 sql.indexOf("end $fn$;",sql.indexOf("create or replace function public.get_public_cart_quote_source("))+"end $fn$;".length,
);
const shippingBlock=sql=>sql.slice(sql.indexOf("if not found",sql.indexOf("select * into v_ship from public.apex_store_shipping_settings")),
 sql.indexOf("then return jsonb_build_object",sql.indexOf("select * into v_ship from public.apex_store_shipping_settings")));

test("only the shipping guard differs from the inventory-aware release-gated cart function",()=>{
 const old=selectFunction(previous),next=selectFunction(migration);
 assert.ok(old.length>5000&&next.length>5000);
 const prefix=shippingBlock(old),replacement=shippingBlock(next);
 assert.notEqual(prefix,replacement);
 assert.equal(next.replace(replacement,prefix),old);
 assert.match(next,/v_ship\.charge_shipping=false/);
 assert.match(next,/v_ship\.charge_shipping=true/);
 assert.match(next,/v_ship\.free_shipping_min_subtotal_cents is not null/);
});

test("anonymous RPC still has independently reviewed eligibility, no private costs or checkout rights",()=>{
 for(const required of [
  "private_release_gate","supplier_release_authorizations",
  "product_release_authorizations","supplier_listing_controls",
  "ctl.admin_gate='clear'","republish_approval_required",
  "inv.quantity_reserved between 0 and inv.quantity_on_hand",
  "src.review_status='approved_for_draft'",
  "listing_identity_holds","can_place_order',false",
  "can_reserve_stock',false","can_create_invoice',false",
  "can_pay',false","is_published=false","cat.is_published=true",
 ])assert.ok(migration.includes(required),required);
 for(const forbidden of [".insert(","create invoice","tax_cents","set enabled=true",
  "insert into apex_internal","update apex_internal.private_release_gate"]){
  assert.equal(migration.toLowerCase().includes(forbidden.toLowerCase()),false,forbidden);
 }
 assert.match(migration,/revoke all on function public\.get_public_cart_quote_source/);
 assert.match(migration,/has_table_privilege\('anon','public\.inventory_items','SELECT'\)/);
});

test("client quote reader understands both shipping configurations without creating order",()=>{
 const product="00000000-0000-0000-0000-000000000010";
 const items=[{product_id:product,quantity:1}];
 const source={schema_version:1,state:"rechecked_inventory_cart",requested_code:"",
  items:[{product_id:product,name:"Synthetic test item",unit_price_cents:"20000",
   quantity:1,availability:"sold_out",can_checkout:false}],
  can_place_order:false,can_create_invoice:false,can_reserve_stock:false,
  can_pay:false,promotion:null,shipping:null};
 const charged={charge_shipping:true,flat_shipping_cents:1500,
  medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
  envelope_max_items:4};
 const optional={charge_shipping:false,flat_shipping_cents:0,
  medium_flat_shipping_cents:0,free_shipping_min_subtotal_cents:null,
  envelope_max_items:4};
 const paid=buildCartReview({...source,shipping:charged},{items,boxSize:"auto"});
 const free=buildCartReview({...source,shipping:optional},{items,boxSize:"auto"});
 assert.equal(paid.ok,true);
 assert.equal(paid.shippingCents,1500);
 assert.equal(free.ok,true);
 assert.equal(free.shippingCents,0);
 assert.equal(free.freeShippingMinimumCents,null);
 for(const result of [paid,free]){
  assert.equal(result.canPlaceOrder,false);
  assert.equal(result.canPay,false);
  assert.equal(result.items[0].availability,"sold_out");
 }
});
