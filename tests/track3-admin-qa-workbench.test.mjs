import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCsvCells}
 from "../src/lib/supplier/sales-reconciliation-csv.mjs";
import {
 previewCumulativeReviewImport,applyCumulativeReviewPreviewLocally,
 serializeCumulativeReviewErrorCsv,
} from "../src/lib/supplier/cumulative-fulfillment-review-csv.mjs";
import {
 createTrack3QaFixtures,TRACK3_QA_STORE,
} from "../src/lib/supplier/track3-qa-fixtures.mjs";

test("admin QA fixture starts with 20 and carries forward 20 + 20 without duplicate identity",()=>{
 const f=createTrack3QaFixtures();
 assert.equal(f.day3Orders,20);
 assert.equal(f.totalOrders,40);
 assert.equal(f.newToday,20);
 assert.equal(f.carriedForward,20);
 const rows=parseCsvCells(f.currentCsv,{maxRows:1002,maxChars:750000});
 assert.equal(rows.length,81);
 const h=rows[0];const original=h.indexOf("order_id");
 const plan=h.indexOf("shipment_id");const kind=h.indexOf("row_kind");
 assert.equal(new Set(rows.slice(1).map(r=>r[original])).size,40);
 const ids=rows.slice(1).filter(r=>r[kind]==="shipment_plan")
  .map(r=>r[plan]);
 assert.equal(ids.length,40);
 assert.equal(new Set(ids).size,40);
 assert.equal(f.manifest.orders,40);
 assert.equal(f.manifest.shippedVerified,0);
 assert.equal(f.manifest.deliveredVerified,0);
 assert.equal(f.manifest.canSend,false);
 assert.equal(f.manifest.requiresAuthenticatedAccess,true);
 assert.equal(f.storeId,TRACK3_QA_STORE);
});

test("old ten offline edits are stale and error CSV preserves no private data",()=>{
 const f=createTrack3QaFixtures();
 const p=previewCumulativeReviewImport(f.staleCsv,f.currentRows,f.storeId);
 assert.equal(p.status,"rejected");
 assert.equal(p.uniqueOrders,20);
 assert.equal(p.staleRows,10);
 assert.equal(p.changedRows,0);
 assert.equal(p.databaseUpdated,false);
 assert.equal(p.canShip,false);
 assert.equal(p.issues.filter(r=>r.code==="stale_revision").length,10);
 const report=serializeCumulativeReviewErrorCsv(p);
 assert.match(report,/stale_revision/);
 assert.doesNotMatch(report,/customer_address|card_number|payment_secret/i);
});

test("fresh edit can be applied locally and its exact replay is unchanged",()=>{
 const f=createTrack3QaFixtures();
 const first=previewCumulativeReviewImport(f.freshCsv,f.currentRows,f.storeId);
 assert.equal(first.status,"preview_only");
 assert.equal(first.changedRows,10);
 assert.equal(first.databaseUpdated,false);
 const adjusted=applyCumulativeReviewPreviewLocally(f.currentRows,first);
 const second=previewCumulativeReviewImport(f.freshCsv,adjusted,f.storeId);
 assert.equal(second.status,"preview_only");
 assert.equal(second.changedRows,0);
 assert.equal(second.alreadyRecordedRows,80);
 assert.equal(second.canShip,false);
});

test("manifest is deterministic, PII free and cannot send attachments",()=>{
 const f=createTrack3QaFixtures();
 const g=createTrack3QaFixtures();
 assert.equal(f.manifest.digestSha256,g.manifest.digestSha256);
 assert.equal(f.manifest.attachmentBytes,g.manifest.attachmentBytes);
 assert.match(f.manifest.digestSha256,/^[a-f0-9]{64}$/);
 assert.match(f.emailPreview.html,/name="viewport"/);
 assert.doesNotMatch(JSON.stringify(f.manifest),
  /recipient|customer_address|email_address|tracking_reference|phone/i);
 assert.doesNotMatch(f.emailPreview.html+f.emailPreview.text,
  /customer_address|buyer_phone|wallet_key/i);
});

test("page and workbench require verified admin and run no network writes",()=>{
 const page=readFileSync("src/app/admin/fulfillment-qa/page.tsx","utf8");
 const client=readFileSync("src/app/admin/fulfillment-qa/workbench.tsx","utf8");
 const fixture=readFileSync("src/lib/supplier/track3-qa-fixtures.mjs","utf8");
 const dashboard=readFileSync("src/app/admin/page.tsx","utf8");
 assert.match(page,/isVerifiedPlatformAdmin/);
 assert.match(page,/createSupplierServerClient/);
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(client,/previewCumulativeReviewImport/);
 assert.match(client,/applyCumulativeReviewPreviewLocally/);
 assert.match(client,/download.*conflict report/i);
 assert.match(dashboard,/\/admin\/fulfillment-qa/);
 for(const source of [client,fixture]){
  assert.doesNotMatch(source,/fetch\(|\.rpc\(|createClient|resend\.|purchaseLabel|createInvoice|decryptAddress|process\.env/);
 }
 assert.match(client,/No database, order, or shipment records were changed/);
});
