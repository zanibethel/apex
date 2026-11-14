import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCheckoutConnectionReportV1} from "../src/lib/checkout/checkout-connection-readiness-v1.mjs";
const read=p=>readFileSync(p,"utf8");
const btcpay={storeStatus:"store_verified",
 recipientStatus:"directory_only_wallets_unverified",
 writerStatus:"configured_not_authorized"};
const journal={heldOrderRecords:0,heldProviderIntents:0,
 checkoutEnabled:false,invoicePostEnabled:false};
test("connection status joins existing catalog, journal and provider evidence without releasing checkout",()=>{
 const r=buildCheckoutConnectionReportV1({
  retailShowcase:true,quoteFlag:true,journal,btcpay,
 });
 assert.equal(r.steps.length,10);
 assert.equal(r.providerConnected,true);
 assert.equal(r.recipientDirectory,true);
 assert.equal(r.journalConnected,true);
 assert.equal(r.heldOrderRecords,0);
 assert.match(r.nextAction,/server-authoritative order-to-invoice writer/);
 assert.equal(r.canCreateOrder,false);
 assert.equal(r.canCreateInvoice,false);
 assert.equal(r.canPay,false);
 assert.equal(r.steps.find(x=>x.id==="checkout").state,"disabled");
 assert.equal(r.steps.find(x=>x.id==="nonpayable").state,"disabled");
});
test("missing or malformed privileged readbacks never appear as connected",()=>{
 const r=buildCheckoutConnectionReportV1({
  retailShowcase:"true",
  quoteFlag:"enabled",
  journal:{heldOrderRecords:2,heldProviderIntents:3,checkoutEnabled:false,
   invoicePostEnabled:false},
  btcpay:{storeStatus:"missing_key",
   recipientStatus:"unavailable",writerStatus:"not_configured"},
 });
 assert.equal(r.steps.find(x=>x.id==="retail").state,"unavailable");
 assert.equal(r.steps.find(x=>x.id==="quote").state,"incomplete");
 assert.equal(r.journalConnected,false);
 assert.equal(r.heldOrderRecords,null);
 assert.equal(r.providerConnected,false);
 assert.match(r.nextAction,/read-only connection/);
});
test("status cannot expose raw provider tokens and has no runtime side effects",()=>{
 const r=buildCheckoutConnectionReportV1({
  btcpay:{...btcpay,secret:"SHOULD_NEVER_BE_IN_REPORT",
   providerName:"demo"}},
 );
 assert.equal(JSON.stringify(r).includes("SHOULD_NEVER_BE_IN_REPORT"),false);
 assert.equal(JSON.stringify(r).includes("demo"),false);
 const page=read("src/app/admin/checkout-integration/page.tsx");
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/get_admin_checkout_journal_overview/);
 assert.match(page,/inspectSharedBtcpayReadinessV1/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|createInvoice\(|sendPayout\(|set_supplier_listing_intent|service_role/);
 const endpoint=read("src/app/api/checkout/handoff/v1/route.ts");
 assert.match(endpoint,/CHECKOUT_UNAVAILABLE/);
 assert.match(endpoint,/status:503/);
});

test("nonpayable submission is distinct from legacy payable checkout and always reports uncertainty",()=>{
 const absent=buildCheckoutConnectionReportV1({nonpayableReadiness:{}});
 assert.equal(absent.steps.find(s=>s.id==="nonpayable").state,"disabled");
 assert.equal(absent.steps.find(s=>s.id==="checkout").state,"disabled");
 const unreviewed=buildCheckoutConnectionReportV1({
  nonpayableReadiness:{requested:true,reviewed:false,routeEligible:false,missing:2},
 });
 assert.equal(unreviewed.steps.find(s=>s.id==="nonpayable").state,"incomplete");
 assert.match(unreviewed.steps.find(s=>s.id==="nonpayable").detail,/review/);
 const acknowledged=buildCheckoutConnectionReportV1({
  nonpayableReadiness:{requested:true,reviewed:true,routeEligible:true,missing:0},
 });
 assert.equal(acknowledged.steps.find(s=>s.id==="nonpayable").state,"configured");
 assert.match(acknowledged.steps.find(s=>s.id==="nonpayable").detail,/independent database order-engine/);
 assert.match(acknowledged.steps.find(s=>s.id==="checkout").detail,/HTTP 503/);
 assert.equal(acknowledged.steps.find(s=>s.id==="checkout").state,"disabled");
 for(const report of [absent,unreviewed,acknowledged]){
  assert.equal(report.canCreateOrder,false);
  assert.equal(report.canCreateInvoice,false);
  assert.equal(report.canPay,false);
 }
});

test("admin integration shows operator flags without inferring independent provider authorization",()=>{
 const page=read("src/app/admin/checkout-integration/page.tsx");
 assert.match(page,/evaluateRetailProductionReadinessV1\(process\.env\)/);
 assert.match(page,/nonpayableReadiness/);
 assert.match(page,/Independent PostgreSQL order-engine gate/);
 assert.match(page,/Not verified here/);
 assert.match(page,/live firewall rules, Supabase Auth provider settings/);
 assert.match(page,/href="\/admin\/checkout-production-readiness"/);
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|createInvoice\(|sendPayout\(|set.*enabled\s*=\s*true/);
});
