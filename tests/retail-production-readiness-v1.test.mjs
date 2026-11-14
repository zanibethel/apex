import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CHECKS_V1,evaluateRetailProductionReadinessV1,
 isRetailProductionReviewApprovedV1}
 from "../src/lib/checkout/retail-production-readiness-v1.mjs";
const approved=Object.fromEntries(CHECKS_V1.map(c=>[c.key,c.value]));
const original={
 APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:"true",
 APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"nonpayable-only-v1",
};
test("extra release conditions are independent and fail closed",()=>{
 assert.equal(CHECKS_V1.length,4);
 for(const x of [undefined,null,{},[],original]){
  assert.equal(evaluateRetailProductionReadinessV1(x).routeEligible,false);
 }
 assert.equal(evaluateRetailProductionReadinessV1(approved).routeEligible,false);
 assert.equal(evaluateRetailProductionReadinessV1({...approved,...original}).routeEligible,true);
 for(const c of CHECKS_V1){
  const invalid={...approved,[c.key]:c.value+" "};
  assert.equal(isRetailProductionReviewApprovedV1(invalid),false,c.id);
  delete invalid[c.key];
  assert.equal(isRetailProductionReviewApprovedV1(invalid),false,c.id);
 }
});
test("the additional gate executes before body, Supabase and PostgreSQL",()=>{
 const route=readFileSync("src/app/api/checkout/nonpayable/v1/route.ts","utf8");
 const release=route.indexOf("isRetailNonpayableSubmissionEnabledV1(process.env)");
 const reviewed=route.indexOf("isRetailProductionReviewApprovedV1(process.env)");
 const body=route.indexOf("isTrustedNonpayableCheckoutEnvelopeV1(request)");
 const user=route.indexOf("await createSupplierServerClient()");
 const db=route.indexOf("createNonpayableRetailProductionRuntimeV1(process.env)");
 assert.ok(release>=0&&reviewed>release&&body>reviewed&&user>body&&db>user);
 assert.match(readFileSync("src/app/cart/page.tsx","utf8"),
  /isRetailProductionReviewApprovedV1\(process.env\)/);
 assert.match(readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8"),
  /export async function POST\(\)\s*\{\s*return unavailable\(\);/);
});
test("admin-only readiness is read-only and does not activate any commerce",()=>{
 const page=readFileSync("src/app/admin/checkout-production-readiness/page.tsx","utf8");
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|service_role|createInvoice/);
});
test("proposed delivery cleanup can only remove terminal encrypted PII",()=>{
 const migration=readFileSync("supabase/migrations/20261114090500_apex_terminal_retail_delivery_purge_v1.sql","utf8");
 for(const p of ["expired_no_payment","cancelled_no_payment","interval '1 hour'",
  "for update of e skip locked","p_limit>100","revoke all on function",
  "is distinct from false","cron.schedule('apex-retail-delivery-purge-v1'"]){
  assert.ok(migration.includes(p),p);
 }
 assert.doesNotMatch(migration,/set\s+enabled\s*=\s*true/i);
});
