import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readPrivateCheckoutSnapshot} from "../src/lib/checkout/private-product-stock-snapshot.mjs";

const store="72000000-0000-0000-0000-000000000001";
const product="74000000-0000-0000-0000-000000000001";
const snapshot={
 schema_version:1,state:"observed_private",store_id:store,product_id:product,
 sku:"TEST-1",name:"Private product",currency:"USD",price_cents:"1234567",
 price_observed_updated_at:"2026-10-30T12:00:00.000Z",
 inventory_observed:true,
 quantity_on_hand:11,quantity_reserved:3,quantity_available:8,
 inventory_observed_updated_at:"2026-10-31T12:00:00.000Z",
 observed_at:"2026-11-01T12:00:00.000Z",
 is_published:false,store_is_public:false,category_is_published:false,
 can_quote:false,can_order:false,can_pay:false,
};
test("admin parser displays canonical private price and available stock but never permits checkout",()=>{
 const r=readPrivateCheckoutSnapshot(snapshot,store,product);
 assert.equal(r.status,"observed_private");
 assert.equal(r.observed,true);
 assert.equal(r.priceLabel,"$12,345.67");
 assert.equal(r.availableUnits,8);
 assert.equal(r.canQuote,false);
 assert.equal(r.canOrder,false);
 assert.equal(r.canPay,false);
 assert.ok(r.blockers.includes("public_release_gate_disabled"));
 assert.ok(r.blockers.includes("order_admission_disabled"));
 assert.ok(r.blockers.includes("product_draft"));
 assert.ok(r.blockers.includes("store_private"));
});

test("private stock missing or zero blocks commerce, price zero never quotes",()=>{
 const missing=readPrivateCheckoutSnapshot({...snapshot,
  inventory_observed:false,quantity_on_hand:null,quantity_reserved:null,
  quantity_available:null,inventory_observed_updated_at:null,
 },store,product);
 assert.equal(missing.observed,true);
 assert.equal(missing.availableUnits,null);
 assert.ok(missing.blockers.includes("inventory_not_observed"));
 const empty=readPrivateCheckoutSnapshot({...snapshot,
  quantity_on_hand:3,quantity_reserved:3,quantity_available:0,
 },store,product);
 assert.ok(empty.blockers.includes("no_available_stock"));
 const zero=readPrivateCheckoutSnapshot({...snapshot,price_cents:"0"},store,product);
 assert.ok(zero.blockers.includes("price_missing"));
 for(const r of [missing,empty,zero]){
  assert.equal(r.canQuote,false);assert.equal(r.canOrder,false);assert.equal(r.canPay,false);
 }
});

test("forged ID, price, stock, missing status and commerce permissions fail closed",()=>{
 const cases=[
  null,[],{}, {...snapshot,store_id:"82000000-0000-0000-0000-000000000001"},
  {...snapshot,product_id:"84000000-0000-0000-0000-000000000001"},
  {...snapshot,price_cents:1234567},
  {...snapshot,price_cents:"1e4"},
  {...snapshot,price_cents:"999999999999999999999999"},
  {...snapshot,currency:"BTC"},
  {...snapshot,can_quote:true},
  {...snapshot,can_pay:true},
  {...snapshot,can_order:true},
  {...snapshot,state:"approved"},
  {...snapshot,schema_version:2},
  {...snapshot,quantity_available:11},
  {...snapshot,quantity_reserved:12},
  {...snapshot,quantity_on_hand:-1},
  {...snapshot,observed_at:"not a date"},
  {...snapshot,inventory_observed:false},
 ];
 for(const variant of cases){
  const r=readPrivateCheckoutSnapshot(variant,store,product);
  assert.equal(r.status,"unavailable");
  assert.equal(r.observed,false);
  assert.equal(r.canQuote,false);
  assert.equal(r.canOrder,false);
  assert.equal(r.canPay,false);
  assert.equal(r.priceLabel,"Not verified");
  assert.equal(r.availableUnits,null);
 }
 assert.equal(readPrivateCheckoutSnapshot(snapshot,"invalid",product).observed,false);
});

test("admin page never invokes private snapshot without explicit server-only flag",()=>{
 const code=readFileSync("src/app/admin/checkout-readiness/page.tsx","utf8");
 const sql=readFileSync("database/sql/apex_private_checkout_product_snapshot_REVIEW_ONLY.sql","utf8");
 assert.match(code,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(code,/process\.env\.APEX_PRIVATE_STOCK_READBACK==="enabled"/);
 assert.match(code,/stockReadbackEnabled\s*\?client\.rpc\("get_private_checkout_product_snapshot"/);
 assert.match(code,/readPrivateCheckoutSnapshot\(snapshot,item\.store_id,item\.product_id\)/);
 assert.match(code,/Admin inspection only/);
 assert.doesNotMatch(code,/\.insert\(|\.update\(|\.delete\(|service_role|NEXT_PUBLIC_APEX_PRIVATE_STOCK/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path=pg_catalog/);
 assert.match(sql,/v_actor is null or not v_admin/);
 assert.match(sql,/p\.store_id=p_store_id and p\.id=p_product_id/);
 assert.match(sql,/revoke all on function public\.get_private_checkout_product_snapshot/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/'can_quote',false,'can_order',false,'can_pay',false/);
 assert.doesNotMatch(sql,/grant execute[^;]*to anon/i);
 assert.doesNotMatch(sql,/\binsert into\s+public\.products\b|\bupdate public\.inventory_items\b/i);
});
