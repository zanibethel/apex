import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeHeldShipmentReview,shipmentReviewHref}
 from "../src/lib/supplier/shipment-review-summary.mjs";
import {HELD_HEADER_LAST_PAGE}
 from "../src/lib/supplier/held-order-header-page.mjs";

const store="62000000-0000-0000-0000-000000000001";
const other="62000000-0000-0000-0000-000000000002";
const row=(state="pending",lines=0,sealed=false)=>({
 status:"held_unverified",canPay:false,canShip:false,
 recordedSaleState:state,storedLineCount:lines,destinationSealed:sealed,
});
const headers=(orders=[])=>({
 storeId:store,total:orders.length,offset:0,orders,
 canShip:false,canPay:false,sourceAttested:false,
});

test("empty held source reports no independently eligible shipments",()=>{
 const result=summarizeHeldShipmentReview(headers(),store);
 assert.ok(result);
 assert.equal(result.totalHeld,0);
 assert.equal(result.pageRecords,0);
 assert.equal(result.independentlyEligible,0);
 assert.equal(result.mayShip,false);
 assert.equal(result.mayPrintLabels,false);
 assert.equal(result.maySendFulfillmentEmail,false);
 assert.equal(Object.isFrozen(result),true);
});
test("metadata gaps are observations, never shipping permissions",()=>{
 const result=summarizeHeldShipmentReview(headers([
  row("confirmed",0,false),
  row("pending",2,true),
  row("refunded",3,false),
 ]),store);
 assert.ok(result);
 assert.equal(result.totalHeld,3);
 assert.equal(result.pageRecords,3);
 assert.equal(result.pageMissingLineSnapshots,1);
 assert.equal(result.pageMissingSealedDestinations,2);
 assert.equal(result.pageRecordedConfirmedObservations,1);
 assert.equal(result.independentlyEligible,0);
});
test("wrong storefront, or forged shipping/payment flags, must fail closed",()=>{
 for(const changed of [
  {storeId:other},{canShip:true},{canPay:true},
  {sourceAttested:true},{total:-1},{offset:-1},
  {orders:null},{total:2.2},
  {orders:[{...row(),canShip:true}]},
  {orders:[{...row(),canPay:true}]},
  {orders:[{...row(),status:"ready_to_ship"}]},
  {orders:[{...row(),destinationSealed:"yes"}]},
  {orders:[{...row(),storedLineCount:-1}]},
 ])assert.equal(summarizeHeldShipmentReview({...headers(),...changed},store),null);
 assert.equal(summarizeHeldShipmentReview(headers([row()]),other),null);
});
test("navigation never accepts unbounded or injected page values",()=>{
 assert.equal(shipmentReviewHref(0),"/supplier/reports/shipment-review");
 assert.equal(shipmentReviewHref(40),"/supplier/reports/shipment-review?page=40");
 for(const p of [-1,41,1.4,NaN,Infinity,"1",null])
  assert.throws(()=>shipmentReviewHref(p),RangeError);
 assert.equal(HELD_HEADER_LAST_PAGE,40);
});
test("read-only supplier UI uses the verified header API and no shipping writer",()=>{
 const ui=readFileSync("src/app/supplier/reports/shipment-review/page.tsx","utf8");
 const nav=readFileSync("src/app/supplier/reports/page.tsx","utf8");
 assert.match(ui,/getSupplierWorkspace/);
 assert.match(ui,/if\(!workspace\)redirect/);
 assert.match(ui,/workspace\.stores\.map/);
 assert.match(ui,/"get_supplier_held_order_headers"/);
 assert.match(ui,/p_store_id:store\.id/);
 assert.match(ui,/parseSupplierHeldOrderHeaders/);
 assert.match(ui,/summarizeHeldShipmentReview/);
 assert.match(ui,/dynamic="force-dynamic"/);
 assert.match(ui,/index:false,follow:false/);
 assert.match(ui,/No held-order records available for review/);
 assert.match(ui,/HELD — NOT READY TO SHIP/);
 assert.match(ui,/not shipping approvals/);
 assert.match(nav,/\/supplier\/reports\/shipment-review/);
 for(const forbidden of [
  "purchaseLabel(","markShipped(","sendEmail(","createInvoice(",
  "decryptAddress(","service_role","supabaseAdmin","order.lines",
  "order.title","order.sku","order.price","order.address",
  "order.email","order.phone","order.tracking",
 ])assert.equal(ui.includes(forbidden),false,forbidden);
});
