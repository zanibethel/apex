import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MARKETPLACE_DEMO_FIXTURES} from "../src/lib/catalog/marketplace-demo-fixtures.mjs";
import {initialShowroomState} from "../src/lib/catalog/supplier-showroom-preview.mjs";
import {computeDemoTotals,makeDemoOrder,advanceDemoOrder} from "../src/lib/catalog/marketplace-demo-order.mjs";

const read=path=>readFileSync(path,"utf8");
const sample=MARKETPLACE_DEMO_FIXTURES;
const state=initialShowroomState(sample);
const goodCart={"sample-a":2};
const customer={name:"Demo Customer",email:"demo@example.invalid",address:"123 Example Avenue",city:"Exampleville",region:"XX",postalCode:"00000"};
const reference="DEMO-12345678-1234-1234-1234-123456789abc";
const at="2026-11-09T22:30:00.000Z";
const start=(overrides={})=>makeDemoOrder({products:sample,visibility:state,cart:goodCart,customer,orderId:reference,at,...overrides});

test("isolated fixtures are only invented demo products and no stored supplier records",()=>{
 assert.equal(sample.length,5);
 for(const p of sample){
  assert.match(p.name,/^Demo /);
  assert.match(p.sku,/^DEMO-/);
  assert.match(p.id,/^sample-/);
  assert.equal(p.currency,"USD");
  assert.doesNotMatch(p.name+" "+p.description,/peptide|anabolic|steroid|inject|prescription|human consumption|research use only/i);
 }
 assert.equal(state["sample-b"].inStock,false);
 assert.equal(state["sample-e"].visible,false);
});

test("fictional checkout calculates totals and never adds sold-out or hidden fixtures",()=>{
 const c=computeDemoTotals(sample,state,{"sample-a":2,"sample-b":1,"sample-e":1},"standard","");
 assert.equal(c.ok,true);
 assert.equal(c.count,2);
 assert.equal(c.subtotalCents,4998);
 assert.equal(c.shippingCents,599);
 assert.equal(c.totalCents,5597);
 const promo=computeDemoTotals(sample,state,goodCart,"priority","DEMO10");
 assert.equal(promo.discountCents,500);
 assert.equal(promo.shippingCents,1199);
 assert.equal(promo.totalCents,5697);
 const free=computeDemoTotals(sample,state,{"sample-a":9},"priority","DEMO10");
 assert.equal(free.ok,true);
 assert.equal(free.shippingCents,0);
 assert.equal(free.totalCents,20242);
 assert.equal(computeDemoTotals(sample,state,{}).ok,false);
 assert.equal(computeDemoTotals(sample,state,goodCart,"bogus").ok,false);
});

test("fictional order snapshots immutable cart inputs and creates no real payment",()=>{
 const source={...goodCart};
 const created=start({cart:source});
 assert.equal(created.ok,true);
 assert.equal(created.order.kind,"isolated_ui_simulation_v1");
 assert.equal(created.order.id,reference);
 assert.equal(created.order.paymentState,"not_processed");
 assert.equal(created.order.fulfillmentState,"not_started");
 assert.equal(created.order.totalCents,5597);
 assert.deepEqual(created.order.items.map(x=>x.sku),["DEMO-A001"]);
 source["sample-a"]=9;
 assert.equal(created.order.items[0].quantity,2,"cart edits must not rewrite the order snapshot");
 assert.equal(created.order.events.length,1);
 assert.equal(start({customer:{...customer,email:""}}).ok,false);
 assert.equal(start({orderId:"REAL-123"}).ok,false);
});

test("payment and fulfillment simulator allows only ordered steps, no replay or forged states",()=>{
 let order=start().order;
 assert.equal(advanceDemoOrder(order,"mark_shipped",at).ok,false);
 const payment=advanceDemoOrder(order,"simulate_payment",at);
 assert.equal(payment.ok,true);
 assert.equal(payment.order.paymentState,"simulated_paid");
 assert.equal(advanceDemoOrder(payment.order,"simulate_payment",at).ok,false);
 assert.equal(advanceDemoOrder(payment.order,"mark_delivered",at).ok,false);
 const packing=advanceDemoOrder(payment.order,"start_packing",at);
 assert.equal(packing.ok,true);
 assert.equal(packing.order.fulfillmentState,"packing");
 const shipping=advanceDemoOrder(packing.order,"mark_shipped",at);
 assert.equal(shipping.ok,true);
 assert.equal(shipping.order.fulfillmentState,"shipped");
 assert.match(shipping.order.trackingReference,/^DEMO-TRACK-/);
 const received=advanceDemoOrder(shipping.order,"mark_delivered",at);
 assert.equal(received.ok,true);
 assert.equal(received.order.fulfillmentState,"delivered");
 assert.equal(received.order.events.length,5);
 assert.equal(advanceDemoOrder(received.order,"mark_delivered",at).ok,false);
 assert.equal(advanceDemoOrder(received.order,"unknown",at).ok,false);
 assert.equal(order.paymentState,"not_processed","transitions do not mutate older snapshots");
});

test("supplier-only demo is strictly a UI simulator, not a real order/payment/shipping path",()=>{
 const page=read("src/app/supplier/catalog/storefront-test/page.tsx");
 const ui=read("src/app/supplier/catalog/storefront-test/marketplace-demo-journey.tsx");
 const model=read("src/lib/catalog/marketplace-demo-order.mjs");
 const fixtures=read("src/lib/catalog/marketplace-demo-fixtures.mjs");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/client\.auth\.getUser\(\)/);
 assert.match(page,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(page,/<MarketplaceDemoJourney\/>/);
 assert.match(ui,/FICTIONAL DATA ONLY/);
 assert.match(ui,/Place demo order \(no payment\)/);
 assert.match(ui,/Record simulated payment/);
 assert.match(ui,/Mark shipped \(simulated\)/);
 assert.match(ui,/SIMULATED RECEIPT — NOT A PURCHASE/);
 assert.match(ui,/Export fictional order JSON/);
 assert.match(ui,/Do not enter real contact, payment or delivery details/);
 assert.match(ui,/crypto\.randomUUID\(\)/);
 assert.match(ui,/Reset entire demo workflow/);
 assert.doesNotMatch(ui+model+fixtures,/fetch\s*\(|axios|supabase|\.rpc\s*\(|\.insert\s*\(|\.update\s*\(|createInvoice|createPayment|createShipment|purchaseLabel|service_role|SUPABASE_SECRET|stripe\.|btcpay\.|resend\./i);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|navigator\.sendBeacon|<form[^>]*action=/i);
});
