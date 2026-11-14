import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync("src/app/admin/checkout-db-connection/page.tsx","utf8");
const probe=readFileSync("src/lib/checkout/retail-production-db-readiness-v1.mjs","utf8");
const existing=readFileSync("src/lib/checkout/retail-restricted-db-probe-v1.mjs","utf8");
const checkout=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");

test("admin auth must be verified before production pool is created",()=>{
 const getUser=page.indexOf("authClient.auth.getUser()");
 const auth=page.indexOf("isVerifiedPlatformAdmin(data.user)");
 const call=page.indexOf("await checkProductionRetailConnectionV1(process.env)");
 assert.ok(getUser>=0&&auth>getUser&&call>auth,
  "Read-only check must execute strictly after verified platform admin auth");
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(page,/export const dynamic="force-dynamic"/);
 assert.match(page,/export const runtime="nodejs"/);
 assert.match(page,/export const revalidate=0/);
 assert.doesNotMatch(page,/NEXT_PUBLIC_APEX_RETAIL|\bdatabasePassword\b|\bcreateInvoice\b/);
});

test("private probe uses only the server runtime and returns safe status",()=>{
 assert.match(probe,/import "server-only"/);
 assert.match(probe,/createRetailCheckoutServerPoolV1\(env,pg\.Pool\)/);
 assert.match(probe,/runRestrictedRetailDiagnosticStagesV1/);
 assert.match(probe,/verifyRestrictedRetailConnectionV1/);
 const stages=readFileSync("src/lib/checkout/retail-db-diagnostic-stages-v1.mjs","utf8");
 assert.match(stages,/verified:false/);
 assert.match(stages,/await pool\.end\(\)/);
 assert.doesNotMatch(probe,/console\.|fetch\(|process\.stdout|service_role|postgres\s*password/i);
 assert.doesNotMatch(page,/\bJSON\.stringify\(process\.env\)|\bBuffer\.from\(process\.env/);
});

test("production diagnostic uses only read-only SQL, rollback and no order writers",()=>{
 assert.match(existing,/"BEGIN READ ONLY"/);
 assert.match(existing,/"SET LOCAL ROLE apex_retail_checkout_executor"/);
 assert.match(existing,/"ROLLBACK"/);
 assert.doesNotMatch(existing,/(?:^|\n)\s*(?:insert into|update |delete from|alter role |commit\b)/im);
 assert.match(page,/orderWritesPerformed|Order, stock or payment writes by this check/);
 assert.match(checkout,/CHECKOUT_UNAVAILABLE/);
 assert.match(checkout,/status:503/);
});

test("production database diagnostic is discoverable only through admin tools",()=>{
 const home=readFileSync("src/app/admin/page.tsx","utf8");
 const integrate=readFileSync("src/app/admin/checkout-integration/page.tsx","utf8");
 assert.match(home,/href: "\/admin\/checkout-db-connection"/);
 assert.match(integrate,/href="\/admin\/checkout-db-connection"/);
 assert.doesNotMatch(page,/export async function (GET|POST)\(/);
 assert.match(page,/customer|orders/i);
});
