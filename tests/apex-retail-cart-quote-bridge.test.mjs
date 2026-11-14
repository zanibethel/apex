import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCartReview} from "../src/lib/cart/customer-cart.mjs";

const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261114010000_apex_retail_cart_quote_bridge.sql");
// Test executable statements, not explanatory references in comments.
const executableSql=sql.replace(/^\s*--.*$/gm,"");
const route=read("src/app/api/cart/quote/route.ts");
const workflow=read(".github/workflows/retail-visibility-migrations.yml");
const item="50000000-0000-4000-8000-000000000005";

test("cart API routes only to the current retail display gate, not the legacy private-release catalog",()=>{
 assert.match(route,/get_public_retail_cart_quote_source/);
 assert.doesNotMatch(route,/APEX_PUBLIC_SOLD_OUT_CATALOG|rpc\/get_public_cart_quote_source|\/api\/checkout\/handoff/);
 assert.match(route,/raw.length>2400/);
 assert.match(route,/cache:"no-store"/);
 assert.doesNotMatch(route,/service_role|console\.|createInvoice|\.insert\(/);
 assert.match(sql,/apex_internal\.retail_showcase_gate/);
 assert.doesNotMatch(executableSql,/private_release_gate|supplier_release_authorizations|product_release_authorizations/);
 assert.match(sql,/create or replace function public\.get_public_retail_cart_quote_source/);
 assert.match(workflow,/cart-quote-assertions.sql/);
});

test("public price feed checks actual supplier publish, holds, ownership, and fresh stock without hardcoded product words",()=>{
 for(const part of [
  "supplier_wants_listing=true","lc.admin_gate='clear'",
  "republish_approval_required","retail_showcase_category_allowed",
  "retail_product_visibility_restrictions","private_product_review_states",
  "supplier_candidate_drafts","listing_identity_holds","archived_at is null",
  "p.price_cents between 1 and 999999999","p.currency='USD'",
  "inventory_items","quantity_reserved","v_product.store_id<>v_store",
  "'can_checkout',false","'can_place_order',false",
  "'can_create_invoice',false","'can_reserve_stock',false","'can_pay',false",
 ])assert.ok(sql.includes(part),part);
 assert.doesNotMatch(sql,/\(peptide\|anabolic\|steroid|research use only|not for human consumption/);
 assert.doesNotMatch(executableSql,/update\s+public\.products|insert\s+into|delete\s+from|createInvoice|btcpay/i);
 assert.match(sql,/revoke all on function public\.get_public_retail_cart_quote_source/);
 assert.match(sql,/grant execute on function public\.get_public_retail_cart_quote_source/);
});

test("browser cart review still never authorizes an order from a matching quotation",()=>{
 const quote={
  schema_version:1,state:"rechecked_inventory_cart",
  items:[{product_id:item,name:"Copper Peptide Hair Serum",
   unit_price_cents:"3999",quantity:1,availability:"in_stock",can_checkout:false}],
  shipping:{charge_shipping:true,flat_shipping_cents:1500,
   medium_flat_shipping_cents:2580,free_shipping_min_subtotal_cents:20001,
   envelope_max_items:4},
  promotion:null,requested_code:"",
  can_place_order:false,can_create_invoice:false,
  can_reserve_stock:false,can_pay:false,
 };
 const review=buildCartReview(quote,{items:[{product_id:item,quantity:1}],boxSize:"auto"});
 assert.equal(review.ok,true);
 assert.equal(review.merchandiseSubtotalCents,3999);
 assert.equal(review.shippingCents,1500);
 assert.equal(review.canPlaceOrder,false);
 assert.equal(review.canPay,false);
 assert.equal(buildCartReview({...quote,can_place_order:true},{
  items:[{product_id:item,quantity:1}],boxSize:"auto"}).ok,false);
 const endpoint=read("src/app/api/checkout/handoff/v1/route.ts");
 assert.match(endpoint,/CHECKOUT_UNAVAILABLE/);
 assert.match(endpoint,/status:503/);
});
