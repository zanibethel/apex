import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=path=>readFileSync(path,"utf8");

test("reserved checkout boundary remains unavailable before reading the request",()=>{
 const route=src("src/app/api/checkout/handoff/v1/route.ts");
 assert.match(route,/export async function POST\(\)\s*\{\s*return unavailable\(\);/);
 assert.match(route,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(route,/canReserveStock:false,canCreateOrder:false,canCreatePayment:false/);
 assert.match(route,/\{status:503,headers:HEADERS\}/);
 assert.doesNotMatch(route,/request\.json\(|request\.formData\(|\.rpc\(|createInvoice\(/);
});

test("historical sale snapshots are not silently used as newly originated checkout orders",()=>{
 const migration=src(
  "supabase/migrations/20261104235408_apex_private_order_detail_foundation.sql");
 assert.match(migration,/sale_id uuid not null references public\.supplier_sales_history\(id\)/);
 assert.match(migration,/create function apex_internal\.validate_order_detail_sale_source\(\)/);
 assert.match(migration,/original_purchased_at timestamptz not null/);
 assert.match(migration,/fulfillment_authorized boolean not null default false/);
 assert.match(migration,/payment_authorized boolean not null default false/);
 assert.match(migration,/order_delivery_envelopes enable row level security/);
 assert.match(migration,/order_delivery_envelopes force row level security/);
});

test("atomic reservation remains a disposable fixture with no hosted writes",()=>{
 const sql=src("database/sql/apex_order_reservation_contract_REVIEW_ONLY.sql");
 assert.match(sql,/current_database\(\)<>'apex_test'/);
 assert.match(sql,/create schema apex_test_reservation/);
 assert.match(sql,/revoke all on schema apex_test_reservation from public,anon,authenticated/);
 assert.match(sql,/tax_quotes/); // Legacy fixture; NOT current checkout tax policy.
 const shipping=src("supabase/migrations/20261103223000_apex_shipping_only_checkout.sql");
 assert.match(shipping,/checkout uses merchandise \+ promo \+ optional shipping ONLY/);
});

test("private delivery envelope preserves held-only access and authenticated encryption",()=>{
 const helper=src("src/lib/payments/private-order-delivery-envelope-v1.mjs");
 assert.match(helper,/createCipheriv\("aes-256-gcm"/);
 assert.match(helper,/associatedData\(storeId,orderId,keyReference\)/);
 assert.match(helper,/delivery_verified:false,shipping_authorized:false/);
 const migration=src(
  "supabase/migrations/20261104235408_apex_private_order_detail_foundation.sql");
 assert.match(migration,/ciphertext bytea not null/);
 assert.match(migration,/auth_tag bytea not null check\(octet_length\(auth_tag\)=16\)/);
});
