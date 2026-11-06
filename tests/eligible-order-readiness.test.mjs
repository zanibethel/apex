import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {parseSupplierEligibleOrderReadinessV1} from "../src/lib/supplier/eligible-order-readiness.mjs";

const store = "62000000-0000-0000-0000-000000000001";
const other = "a2154000-0000-4000-8000-000000000001";
const payload = () => ({
 schema_version:1,source:"held_order_readiness_no_independent_attestation",
 store_id:store,held_order_count:6,eligible_order_count:0,eligible_orders:[],
 blocker:"independent_eligibility_evidence_not_integrated",
 read_only:true,eligible_queue_enabled:false,payment_verified:false,
 product_and_transport_verified:false,delivery_access_enabled:false,
 shipping_enabled:false,can_purchase_label:false,can_record_tracking:false,
});

test("accepts a supplier-scoped blocked read and never converts confirmed sales to eligibility",()=>{
 const result=parseSupplierEligibleOrderReadinessV1(payload(),store);
 assert.ok(result);
 assert.equal(result.heldOrderCount,6);
 assert.deepEqual(result.eligibleOrders,[]);
 assert.equal(result.canShip,false);
 assert.equal(result.canPay,false);
 assert.equal(result.canReadDelivery,false);
 assert.equal(result.canRecordTracking,false);
});

test("rejects cross-store, extra fields, fabricated eligibility and capabilities",()=>{
 const bad=[
  x=>{x.store_id=other;},
  x=>{x.schema_version=2;},
  x=>{x.source="provider_attested";},
  x=>{x.held_order_count=-1;},
  x=>{x.held_order_count=1.5;},
  x=>{x.eligible_order_count=1;},
  x=>{x.eligible_orders=[{order_id:"made-up"}];},
  x=>{x.blocker="verified";},
  x=>{x.eligible_queue_enabled=true;},
  x=>{x.payment_verified=true;},
  x=>{x.product_and_transport_verified=true;},
  x=>{x.delivery_access_enabled=true;},
  x=>{x.shipping_enabled=true;},
  x=>{x.can_purchase_label=true;},
  x=>{x.can_record_tracking=true;},
  x=>{x.read_only=false;},
  x=>{x.address="private";},
 ];
 for(const tamper of bad){
  const x=payload();tamper(x);
  assert.equal(parseSupplierEligibleOrderReadinessV1(x,store),null);
 }
 assert.equal(parseSupplierEligibleOrderReadinessV1(payload(),other),null);
 assert.equal(parseSupplierEligibleOrderReadinessV1(null,store),null);
});

test("hosted RPC is member-scoped and cannot turn held data into operational authority",()=>{
 const sql=readFileSync("supabase/migrations/20261106235000_apex_eligible_order_readiness_v1.sql","utf8");
 assert.match(sql,/get_supplier_eligible_order_readiness_v1/);
 assert.match(sql,/join public\.supplier_memberships m on m\.supplier_id = s\.supplier_id/);
 assert.match(sql,/m\.user_id = v_uid/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path = pg_catalog/);
 assert.ok(sql.includes("'eligible_orders', '[]'::jsonb"));
 const ci=readFileSync(".github/workflows/payout-rls.yml","utf8");
 assert.ok(ci.includes("20261106235000_apex_eligible_order_readiness_v1.sql"));
 assert.ok(ci.includes("tests/payout-rls/eligible-order-readiness-v1.sql"));
 assert.doesNotMatch(sql,/create table|insert into|update apex_internal|delete from apex_internal/i);
});
