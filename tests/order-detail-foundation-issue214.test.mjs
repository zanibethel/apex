import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSupplierOrderDetailFoundation}
 from "../src/lib/supplier/order-detail-foundation.mjs";
const read=p=>readFileSync(p,"utf8");
const storeId="62000000-0000-0000-0000-000000000001";
const payload={
 schema_version:1,
 store_id:storeId,
 order_snapshots:1,
 line_snapshots:2,
 sealed_destinations:1,
 source:"verified_sales_history",
 order_ingest_enabled:false,
 delivery_decryption_enabled:false,
 shipping_enabled:false,
 payment_enabled:false,
 detail_status:"held_unverified",
};
test("private order detail readback recognizes only verified schema and no commerce rights",()=>{
 const result=parseSupplierOrderDetailFoundation(payload,storeId);
 assert.deepEqual(result,{
  orders:1,lines:2,destinationsSealed:1,
  canImportOrders:false,canShip:false,canCollectPayments:false,
 });
 assert.equal(Object.isFrozen(result),true);
 for(const invalid of [
  {...payload,order_ingest_enabled:true},
  {...payload,delivery_decryption_enabled:true},
  {...payload,shipping_enabled:true},
  {...payload,payment_enabled:true},
  {...payload,detail_status:"ready_to_ship"},
  {...payload,sealed_destinations:2},
  {...payload,order_snapshots:-1},
  {...payload,line_snapshots:1.5},
  {...payload,store_id:"62000000-0000-0000-0000-000000000002"},
  {...payload,shipping_address:"private"},
  {...payload,schema_version:2},
 ]){
  assert.equal(parseSupplierOrderDetailFoundation(invalid,storeId),null);
 }
});
test("order detail tables are private, append-only and sourced from real sales",()=>{
 const sql=read("supabase/migrations/20261104235408_apex_private_order_detail_foundation.sql");
 assert.match(sql,/references public\.supplier_sales_history\(id\)/);
 assert.match(sql,/v_sale\.occurred_at is distinct from new\.original_purchased_at/);
 assert.match(sql,/v_sale\.order_reference is distinct from new\.source_order_reference/);
 assert.match(sql,/v_sale\.sale_state is distinct from new\.source_payment_state/);
 assert.match(sql,/unique\(store_id,sale_id\)/);
 assert.match(sql,/unique\(store_id,source_order_reference\)/);
 assert.match(sql,/unique\(order_id,source_line_reference\)/);
 assert.match(sql,/unique\(order_id,line_number\)/);
 assert.match(sql,/foreign key\(store_id,product_id\)/);
 assert.match(sql,/references public\.products\(store_id,id\)/);
 assert.match(sql,/line_subtotal_cents bigint generated always as/);
 assert.match(sql,/aes-256-gcm-v1/);
 assert.match(sql,/octet_length\(nonce\)=12/);
 assert.match(sql,/octet_length\(auth_tag\)=16/);
 assert.match(sql,/deny_order_detail_mutation/);
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/force row level security/g);
 assert.match(sql,/revoke all on apex_internal\.order_detail_snapshots/);
 assert.match(sql,/shipping_authorized=false/);
 assert.match(sql,/payment_authorized=false/);
 assert.match(sql,/fulfillment_authorized=false/);
 assert.doesNotMatch(sql,/grant (insert|update|delete) on apex_internal\.order_detail/i);
 assert.doesNotMatch(sql,/create policy.*using\s*\(true\)/i);
});
test("supplier readiness RPC returns only safe aggregates and is not an order export",()=>{
 const sql=read("supabase/migrations/20261104235408_apex_private_order_detail_foundation.sql");
 const page=read("src/app/supplier/reports/order-foundation/page.tsx");
 const reports=read("src/app/supplier/reports/page.tsx");
 assert.match(sql,/public\.get_supplier_order_detail_foundation\(p_store_id uuid\)/);
 assert.match(sql,/join public\.supplier_memberships m/);
 assert.match(sql,/m\.user_id=v_uid/);
 assert.match(sql,/coalesce\(\(select auth\.jwt\(\)\)->>'is_anonymous','false'\)/);
 assert.match(sql,/get_supplier_order_detail_foundation\(uuid\)\s+to authenticated/);
 assert.doesNotMatch(sql,/grant execute on function public\.get_supplier_order_detail_foundation\(uuid\)\s+to anon/);
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/get_supplier_order_detail_foundation/);
 assert.match(page,/parseSupplierOrderDetailFoundation/);
 assert.match(page,/Order ingestion is not active/);
 assert.match(page,/not exposed on this screen/);
 assert.match(reports,/href="\/supplier\/reports\/order-foundation"/);
 assert.doesNotMatch(page,/customer_name|shipping_address|phone_number|decrypt|processPayment|createOrder\(/i);
});
test("isolated SQL tests cover replay, wrong store, frozen purchase identity and closed release",()=>{
 const fixture=read("tests/payout-rls/private-order-detail-foundation.sql");
 assert.match(fixture,/current_database\(\)<>'apex_test'/);
 assert.match(fixture,/Replay created a duplicate canonical order/);
 assert.match(fixture,/Changed purchase timestamp accepted/);
 assert.match(fixture,/False verified payment state accepted/);
 assert.match(fixture,/Cross-store order line accepted/);
 assert.match(fixture,/Original purchase time is mutable/);
 assert.match(fixture,/Unrelated supplier saw private order counts/);
 assert.match(fixture,/Fixture leaked orders, delivery or enabled checkout/);
 assert.match(fixture,/rollback;/);
});
