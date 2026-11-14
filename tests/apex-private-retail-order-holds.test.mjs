import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(
 "supabase/migrations/20261114022000_apex_private_retail_order_hold_engine.sql","utf8");
const ci=readFileSync(".github/workflows/retail-visibility-migrations.yml","utf8");
const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");

test("private-only atomic checkout foundation has a separate default-off commerce gate",()=>{
 assert.match(sql,/create table apex_internal\.retail_order_engine_gate/);
 assert.match(sql,/values\(true,false\)/);
 assert.match(sql,/engine remains disabled/);
 assert.match(sql,/create function apex_internal\.reserve_retail_order_hold/);
 assert.match(sql,/create function apex_internal\.end_retail_order_hold/);
 assert.match(sql,/create function apex_internal\.expire_due_retail_order_holds/);
 assert.match(sql,/security invoker/);
 assert.doesNotMatch(sql,/create(?: or replace)? function public\.reserve_retail_order_hold/);
 assert.match(sql,/revoke all on function apex_internal\.reserve_retail_order_hold/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(route,/CHECKOUT_UNAVAILABLE/);
 assert.match(route,/status:503/);
});

test("held line IDs and prices are immutable and only stock reservation changes",()=>{
 for(const value of [
  "retail_order_holds","retail_order_hold_lines",
  "retail_order_hold_events","id uuid primary key default gen_random_uuid()",
  "unique(store_id,request_id)","for update",
  "pg_advisory_xact_lock","v_existing.payload_digest<>v_digest",
  "v_existing.request_fingerprint<>p_request_fingerprint",
  "quantity_reserved=quantity_reserved+v_qty",
  "quantity_reserved=quantity_reserved-v_line.quantity",
  "snapshot","end_retail_order_hold",
  "for update skip locked","expire_due_retail_order_holds",
  "'held_no_payment'","'cancelled_no_payment'","'expired_no_payment'",
  "'can_pay',false","'can_ship',false","'invoice_created',false",
  "apex_retail_hold_lines_immutable",
 ])assert.ok(sql.includes(value),value);
 assert.doesNotMatch(sql,/create\s+(?:function|table)\s+public\.retail_order/i);
 assert.doesNotMatch(sql,/createInvoice|BTCPay.*POST|create\s+payment\s+intent/i);
});

test("saved pricing, shipping, discount checks and admin holds are independent of product keywords",()=>{
 for(const value of [
  "retail_showcase_gate","supplier_wants_listing",
  "retail_product_visibility_restrictions","listing_identity_holds",
  "private_product_review_states","supplier_candidate_drafts",
  "retail_showcase_category_allowed","v_product.price_cents not between 1 and 999999999",
  "v_product.price_cents*v_qty","promotion_code",
  "min_subtotal_cents","redemption_count","envelope_max_items",
  "medium_flat_shipping_cents","Stale cart total",
 ])assert.ok(sql.includes(value),value);
 assert.doesNotMatch(sql,/\(peptide\|anabolic\|steroid|research use only/);
 assert.match(ci,/private-order-holds.sql/);
 assert.match(ci,/apex_private_retail_order_hold_engine.sql/);
});

test("private store order hold contains no delivery PII or customer-facing admission",()=>{
 const cols=sql.slice(sql.indexOf("create table apex_internal.retail_order_holds"),
  sql.indexOf("create index apex_retail_order_holds_due_idx"));
 assert.doesNotMatch(cols,/\b(email|address|phone|wallet|private_key|service_key)\b/i);
 assert.doesNotMatch(sql,/grant execute on function apex_internal\.reserve_retail_order_hold/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/force row level security/);
});
