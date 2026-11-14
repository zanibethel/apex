import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("real PostgreSQL checkout drill is strictly disposable and uses two eligible fixture lines",()=>{
 const source=read("scripts/test-retail-postgres-connection.mjs");
 for(const guard of [
  'process.env.PGHOST!=="localhost"',
  'process.env.PGDATABASE!=="retail_test"',
  'process.env.CI!=="true"',
  'process.env.PGUSER!=="apex_retail_checkout_app"',
 ])assert.ok(source.includes(guard),guard);
 assert.match(source,/const SERUM="50000000-0000-4000-8000-000000000005"/);
 assert.match(source,/cart:\{items:\[\{product_id:PRODUCT,quantity:1\},/);
 assert.match(source,/\{product_id:SERUM,quantity:1\}\],code:"TEST10"/);
 assert.match(source,/createRetailPostgresTransactionV1\(\{pool\}\)/);
 assert.match(source,/preparePrivateRetailHoldWithDeliveryV1\(raw,options\)/);
 assert.match(source,/await assert\.rejects\(/);
 assert.match(source,/\/api\/checkout\/nonpayable\/v1/);
 assert.match(source,/admitPrivateNonpayableRetailOrderV1/);
 assert.match(source,/replay\.orderId,receipt\.orderId/);
 assert.match(source,/admitted\.orderId,receipt\.orderId/);
 assert.match(source,/assert\.equal\(admitted\.canPay,false\)/);
 assert.match(source,/assert\.equal\(admitted\.canShip,false\)/);
 assert.doesNotMatch(source,/https:\/\/.*supabase\.co|service_role|postgres\.supabase\.co|createInvoice|sendPayout|paymentConfirmed:true/);
});

test("disposable CI checks immutable line snapshots and exact stock hold/release for both products",()=>{
 const workflow=read(".github/workflows/retail-visibility-migrations.yml");
 assert.match(workflow,/paths:[\s\S]*scripts\/test-retail-postgres-connection\.mjs/);
 for(const p of [
  "src/lib/checkout/private-retail-hold-coordinator-v1.mjs",
  "src/lib/checkout/retail-nonpayable-admission-controller-v1.mjs",
  "src/app/api/checkout/nonpayable/v1/route.ts",
 ])assert.ok(workflow.includes(p),p);
 assert.match(workflow,/run: node scripts\/test-retail-postgres-connection\.mjs/);
 assert.match(workflow,/PGDATABASE: retail_test/);
 assert.match(workflow,/PGUSER: apex_retail_checkout_app/);
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/alter role apex_retail_checkout_app nologin/);
 assert.match(workflow,/enabled=false where singleton=true/);
 assert.match(workflow,/o\.line_count=2 and o\.unit_count=2/);
 assert.match(workflow,/o\.total_cents=7979/);
 assert.match(workflow,/l\.sku_snapshot='SHIRT-001'/);
 assert.match(workflow,/l\.sku_snapshot='SERUM-001'/);
 assert.match(workflow,/event_type='hold_expired'/);
 assert.match(workflow,/v_first<>1 or v_again<>0/);
 assert.match(workflow,/where product_id='50000000-0000-4000-8000-000000000005'\)<>0/);
 assert.match(workflow,/where product_id='50000000-0000-4000-8000-000000000001'\)<>0/);
});

test("payable checkout route and private production gate remain separately locked",()=>{
 const route=read("src/app/api/checkout/handoff/v1/route.ts");
 const nonpayable=read("src/app/api/checkout/nonpayable/v1/route.ts");
 const gate=read("src/lib/checkout/retail-nonpayable-route-release-v1.mjs");
 assert.match(route,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(route,/status:503/);
 assert.match(nonpayable,/isRetailNonpayableSubmissionEnabledV1\(process.env\)/);
 assert.match(nonpayable,/isRetailProductionReviewApprovedV1\(process.env\)/);
 assert.match(gate,/env\.APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED==="true"/);
 assert.doesNotMatch(nonpayable,/createInvoice|sendPayout|service_role/);
});
