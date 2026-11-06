import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 parseSupplierHeldOrderRecord,supplierHeldOrderHref,isSupplierOrderId,
} from "../src/lib/supplier/held-order-record.mjs";

const read=path=>readFileSync(path,"utf8");
const store="62000000-0000-0000-0000-000000000001";
const order="66000299-0000-4000-8000-000000000001";
const data={
 schema_version:1,source:"original_held_order_record",
 store_id:store,order_id:order,
 original_reference:"SAMPLE-ORIGINAL-001",
 purchased_at_utc:"2026-11-06T18:30:00.000Z",
 recorded_sale_state:"confirmed",stored_line_count:2,
 destination_sealed:true,source_history_matched:true,
 held_only:true,payment_enabled:false,shipping_enabled:false,
 delivery_decryption_enabled:false,
};

test("parse strict authenticated held record, never infer settlement or shipment rights",()=>{
 const p=parseSupplierHeldOrderRecord(data,store,order);
 assert.ok(p);
 assert.equal(p.id,order);
 assert.equal(p.storeId,store);
 assert.equal(p.reference,"SAMPLE-ORIGINAL-001");
 assert.equal(p.storedLineCount,2);
 assert.equal(p.destinationSealed,true);
 assert.equal(p.sourceHistoryMatched,true);
 assert.equal(p.canShip,false);
 assert.equal(p.canPay,false);
 assert.equal(p.canPurchaseLabel,false);
 assert.equal(p.canUpdateTracking,false);
 assert.equal(p.canViewDelivery,false);
 assert.equal(p.status,"held_unverified");
 assert.deepEqual(Object.keys(p).sort(),[
  "canPay","canPurchaseLabel","canShip","canUpdateTracking",
  "canViewDelivery","destinationSealed","id","purchasedAt",
  "recordedSaleState","reference","sourceHistoryMatched",
  "status","storeId","storedLineCount",
 ].sort());
});

test("wrong tenant, wrong order ID, unsupported fields, premature authorization and bad timestamps all fail closed",()=>{
 assert.equal(parseSupplierHeldOrderRecord(data,store,"66000299-0000-4000-8000-000000000099"),null);
 assert.equal(parseSupplierHeldOrderRecord(data,"62000000-0000-0000-0000-000000000002",order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,customer_address:"hidden"},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,product_title:"hidden"},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,payment_enabled:true},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,shipping_enabled:true},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,delivery_decryption_enabled:true},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,held_only:false},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,source_history_matched:false},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,stored_line_count:51},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,purchased_at_utc:"2026-11-06"},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,original_reference:"\nnew"},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord({...data,recorded_sale_state:"settled"},store,order),null);
 assert.equal(parseSupplierHeldOrderRecord([],store,order),null);
});

test("links use only verified immutable IDs and preserve the supplier store selector",()=>{
 assert.equal(supplierHeldOrderHref(store,order),
  "/supplier/orders/"+order+"?store="+store);
 assert.equal(supplierHeldOrderHref(store,"not-a-uuid"),null);
 assert.equal(supplierHeldOrderHref("not-a-uuid",order),null);
 assert.equal(isSupplierOrderId(order),true);
 assert.equal(isSupplierOrderId(order+"/../../../"),false);
});

test("single-order UI revalidates membership and offers no shipping, label, tracking or checkout action",()=>{
 const page=read("src/app/supplier/orders/[orderId]/page.tsx");
 const hub=read("src/app/supplier/orders/page.tsx");
 const headers=read("src/app/supplier/reports/order-foundation/headers/page.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/workspace\.stores\.find\(s=>s\.id===storeId\)/);
 assert.match(page,/if\(!workspace\)redirect\("\/supplier\/sign-in"\)/);
 assert.match(page,/get_supplier_held_order_record/);
 assert.match(page,/parseSupplierHeldOrderRecord\(response\.data,store\.id,orderId\)/);
 assert.match(page,/!store\|\|!order/);
 assert.match(page,/Held · not shippable/);
 assert.match(page,/not independent payment settlement/);
 assert.match(hub,/supplierHeldOrderHref\(store\.id,order\.id\)/);
 assert.match(headers,/supplierHeldOrderHref\(store\.id,order\.id\)/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|\.insert\(|\.update\(|buyLabel|purchaseLabel|enterTracking|\.from\("order_delivery_envelopes"\)/);
});

test("database function remains tenant-scoped, immutable and explicitly prevents leakage and commerce",()=>{
 const sql=read("supabase/migrations/20261106213000_apex_supplier_held_order_record_readonly.sql");
 const ci=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/create function public\.get_supplier_held_order_record/);
 assert.match(sql,/stable security definer/);
 assert.match(sql,/set search_path=pg_catalog/);
 assert.match(sql,/m\.user_id=v_uid/);
 assert.match(sql,/private_release_gate/);
 assert.match(sql,/p_order_id/);
 assert.match(sql,/source_history_matched/);
 assert.match(sql,/shipping_enabled',false/);
 assert.match(sql,/payment_enabled',false/);
 assert.match(sql,/delivery_decryption_enabled',false/);
 assert.match(sql,/revoke all on function public\.get_supplier_held_order_record/);
 assert.match(sql,/grant execute on function public\.get_supplier_held_order_record/);
 assert.doesNotMatch(sql,/jsonb_build_object\([^)]*'title_at_purchase'|createInvoice|service_role|purchaseLabel|shipping_authorized',true/);
 assert.match(ci,/supplier-held-order-record\.sql/);
});
