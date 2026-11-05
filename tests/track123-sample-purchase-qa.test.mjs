import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runEndToEndSamplePurchaseQa}
 from "../src/lib/checkout/end-to-end-sample-purchase-qa.mjs";

test("one sample purchase uses Track 1 cart, Track 2 handoff/payment evidence and Track 3 review",()=>{
 const result=runEndToEndSamplePurchaseQa();
 assert.equal(result.schemaVersion,1);
 assert.equal(result.mode,"local_synthetic_only");
 assert.equal(result.testResult,"passed_without_live_transactions");
 assert.deepEqual(result.summary,{
  items:2,units:3,merchandiseCents:5500,
  shippingCents:800,totalCents:6300,currency:"USD",
 });
 assert.equal(result.stages.length,6);
 assert.deepEqual(result.stages.map(s=>s.name),[
  "Customer cart","Checkout handoff","Order identity",
  "Bitcoin payment","Supplier fulfillment","Supplier report",
 ]);
 assert.deepEqual(result.stages.map(s=>s.status),[
  "passed","passed","passed","test_only","held","passed",
 ]);
 assert.equal(result.simulatedProviderEventVerified,true);
 for(const key of ["liveCheckoutEnabled","realPaymentSettled",
  "supplierShipmentAuthorized","postagePurchased",
  "orderCreatedInDatabase","emailSent"])
  assert.equal(result[key],false,key);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.stages),true);
});
test("sample results omit synthetic private addresses, fingerprints and payment credentials",()=>{
 const result=JSON.stringify(runEndToEndSamplePurchaseQa());
 for(const term of [
  "Sample Customer","123 Example Street","sample@example.invalid",
  "Testville","79401","synthetic-qa-fingerprint",
  "synthetic-qa-webhook-secret","requestFingerprint",
  "serverOnlyDelivery","cartFingerprint","idempotencyHash",
  "authorization","private_key",
 ])assert.equal(result.includes(term),false,term);
 assert.match(result,/no real invoice/);
 assert.match(result,/no shipment/);
});
test("joint contract tests fail closed and do not modify live operations",()=>{
 const source=readFileSync(
  "src/lib/checkout/end-to-end-sample-purchase-qa.mjs","utf8");
 const admin=readFileSync("src/app/admin/fulfillment-qa/page.tsx","utf8");
 const ui=readFileSync(
  "src/app/admin/fulfillment-qa/sample-purchase-flow.tsx","utf8");
 for(const symbol of [
  "buildCartReview","prepareTrack1CheckoutHandoffForTrack2V1",
  "verifyHeldOrderReadbackV1","parseVerifiedInvoiceEvent",
  "reviewFulfillmentTransition","summarizeReviewAllocations",
  "buildCumulativeReviewWorkbook","createSupplierReviewEmailPreview",
 ])assert.ok(source.includes(symbol),symbol);
 for(const pattern of [
  /canPlaceOrder===false/,/canPay===false/,/canShip===false/,
  /status==="stale_version"/,/tamperRejected/,
  /orderCreatedInDatabase:false/,/postagePurchased:false/,
 ])assert.match(source,pattern);
 assert.doesNotMatch(source,/\bfetch\s*\(|\.rpc\(|createClient|process\.env|console\.|\.insert\(|purchaseLabel|sendEmail|createTestInvoice\(/);
 assert.match(admin,/isVerifiedPlatformAdmin/);
 assert.match(admin,/SamplePurchaseFlow result=\{sample\}/);
 assert.match(ui,/Run sample purchase/);
 assert.match(ui,/onClick=\{\(\)=>setRan\(true\)\}/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|\.rpc\(|localStorage|sessionStorage|createInvoice|purchaseLabel/);
});
