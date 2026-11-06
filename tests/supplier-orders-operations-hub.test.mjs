import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 recordedOrderObservation,summarizeSupplierOperations,
 SUPPLIER_ORDER_VIEW_LIMIT,
} from "../src/lib/supplier/supplier-order-operations.mjs";
const read=path=>readFileSync(path,"utf8");
const header=Object.freeze({
 storeId:"00000000-0000-4000-8000-000000000011",
 total:2,limit:25,offset:0,hasMore:false,
 canShip:false,canPay:false,sourceAttested:false,
 orders:[
  {id:"00000000-0000-4000-8000-000000000021",reference:"ORD-001",
   purchasedAt:"2026-11-06T15:00:00.000Z",status:"held_unverified",
   storedLineCount:1,destinationSealed:true,canShip:false,canPay:false,
   recordedSaleState:"confirmed"},
  {id:"00000000-0000-4000-8000-000000000022",reference:"ORD-002",
   purchasedAt:"2026-11-06T14:00:00.000Z",status:"held_unverified",
   storedLineCount:0,destinationSealed:false,canShip:false,canPay:false,
   recordedSaleState:"pending"},
 ],
});
const detail=Object.freeze({
 orders:2,lines:1,destinationsSealed:1,
 canImportOrders:false,canShip:false,canCollectPayments:false,
});
const usps=Object.freeze({status:"verified",postagePayer:"supplier",
 canPurchaseLabel:false,trackingSync:false});
test("operations hub reports actual held metadata without implying shipping authority",()=>{
 const data=summarizeSupplierOperations(header,detail,usps);
 assert.ok(data);
 assert.equal(data.held,2);
 assert.equal(data.shown,2);
 assert.equal(data.recordedLineSnapshots,1);
 assert.equal(data.sealedDeliveryRecords,1);
 assert.equal(data.missingLineSnapshotsThisPage,1);
 assert.equal(data.uspsStatus,"verified");
 assert.equal(data.canShip,false);
 assert.equal(data.canPurchaseLabels,false);
 assert.equal(data.canSeeDeliveryAddresses,false);
 assert.equal(data.canPay,false);
 assert.equal(data.sourceVerified,false);
 assert.equal(data.requiresIndependentVerification,true);
 assert.match(recordedOrderObservation("confirmed"),/settlement not verified/);
 assert.equal(recordedOrderObservation("unknown"),"Recorded state unavailable");
});
test("incomplete sources do not become zero orders or ready shipments",()=>{
 const result=summarizeSupplierOperations(null,null,null);
 assert.ok(result);
 assert.equal(result.held,null);
 assert.equal(result.recordedLineSnapshots,null);
 assert.equal(result.uspsStatus,null);
 assert.equal(result.recordsReady,false);
 assert.equal(result.canShip,false);
});
test("misleading or oversized source data is rejected",()=>{
 assert.equal(summarizeSupplierOperations({...header,canShip:true},detail,usps),null);
 assert.equal(summarizeSupplierOperations({...header,sourceAttested:true},detail,usps),null);
 assert.equal(summarizeSupplierOperations({...header,
  orders:[{...header.orders[0],status:"shipped"}]},detail,usps),null);
 assert.equal(summarizeSupplierOperations({...header,
  orders:[{...header.orders[0],canPay:true}]},detail,usps),null);
 assert.equal(summarizeSupplierOperations(header,{...detail,canShip:true},usps),null);
 assert.equal(summarizeSupplierOperations(header,detail,{...usps,canPurchaseLabel:true}),null);
 assert.equal(summarizeSupplierOperations({...header,
  orders:Array.from({length:SUPPLIER_ORDER_VIEW_LIMIT+1},()=>header.orders[0])},detail,usps),null);
});
test("new hub reads only supplier-authenticated RLS RPCs and remains read-only",()=>{
 const page=read("src/app/supplier/orders/page.tsx");
 assert.match(page,/getSupplierWorkspace\(\)/);
 assert.match(page,/if\(!w\)redirect\("\/supplier\/sign-in"\)/);
 assert.match(page,/w\.stores\.map\(async store=>/);
 assert.match(page,/get_supplier_held_order_headers/);
 assert.match(page,/get_supplier_order_detail_foundation/);
 assert.match(page,/get_supplier_usps_readiness/);
 assert.match(page,/parseSupplierHeldOrderHeaders/);
 assert.match(page,/parseSupplierOrderDetailFoundation/);
 assert.match(page,/parseSupplierUspsReadiness/);
 assert.match(page,/summarizeSupplierOperations\(headers,details,usps\)/);
 assert.match(page,/headers\.total===0/);
 assert.match(page,/!headers\?/);
 assert.match(page,/Held · not shippable/);
 assert.match(page,/A recorded sale/);
 assert.match(page,/No customer address/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|createInvoice|placeOrder|purchaseLabel|\.insert\(|\.update\(|shipping_authorized:true|canShip:true/);
});
test("supplier dashboard and reporting lead into one mobile operations workspace",()=>{
 const home=read("src/app/supplier/page.tsx");
 const reports=read("src/app/supplier/reports/page.tsx");
 const daily=read("src/app/supplier/reports/daily/page.tsx");
 const css=read("src/app/supplier/orders/orders.css");
 assert.match(home,/href="\/supplier\/orders" className="button secondary">Orders &amp; Fulfillment/);
 assert.match(reports,/href="\/supplier\/orders">Orders &amp; Fulfillment/);
 assert.match(daily,/href="\/supplier\/orders">Orders &amp; Fulfillment/);
 assert.match(css,/max-width:480px/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
