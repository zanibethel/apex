import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isRetailNonpayableSubmissionEnabledV1}
 from "../src/lib/checkout/retail-nonpayable-route-release-v1.mjs";
import {isTrustedNonpayableCheckoutEnvelopeV1,
 readNonpayableCheckoutRequestV1}
 from "../src/lib/checkout/retail-nonpayable-request-boundary-v1.mjs";

const root="https://apexanabolics.co";
const path=root+"/api/checkout/nonpayable/v1";
const payload={
 schemaVersion:1,requestId:"a471a688-9a9d-470d-8d9c-3ee8cbb87642",
 cart:{items:[{product_id:"50000000-0000-4000-8000-000000000001",quantity:1}],
  code:"",boxSize:"auto"},
 delivery:{firstName:"Test",lastName:"Customer",email:"customer@example.invalid",
  phone:"",address1:"123 Fictional Way",address2:"",
  city:"Mock City",state:"TX",postalCode:"79401"},
};
const make=(url=path,headers={})=>new Request(url,{
 method:"POST",
 headers:{"Origin":root,"Content-Type":"application/json",
  "Sec-Fetch-Site":"same-origin",...headers},
 body:JSON.stringify(payload),
});
test("production admission is OFF unless two operator-owned settings exactly match",()=>{
 for(const env of [
  undefined,{},null,[],{APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:"true"},
  {APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"nonpayable-only-v1"},
  {APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:true,
   APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"nonpayable-only-v1"},
  {APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:"enabled",
   APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"nonpayable-only-v1"},
  {APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:"true",
   APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"true"},
 ])assert.equal(isRetailNonpayableSubmissionEnabledV1(env),false);
 assert.equal(isRetailNonpayableSubmissionEnabledV1({
  APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED:"true",
  APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL:"nonpayable-only-v1",
 }),true);
});
test("new nonpayable path admits only a same-origin bounded POST envelope",async()=>{
 const req=make();
 assert.equal(isTrustedNonpayableCheckoutEnvelopeV1(req),true);
 assert.equal(req.bodyUsed,false);
 const parsed=await readNonpayableCheckoutRequestV1(req);
 assert.equal(parsed.ok,true);
 assert.equal(parsed.request.delivery.address1,payload.delivery.address1);
 assert.equal(req.bodyUsed,true);
});
test("cross-origin, redirects, unknown path, and query-string rejects without reading buyer PII",()=>{
 const cases=[
  make(path,{"Origin":"https://bad.example"}),
  make(path,{"Sec-Fetch-Site":"cross-site"}),
  make(path,{"Content-Type":"text/plain"}),
  make(path,{"Content-Encoding":"gzip"}),
  make(root+"/api/checkout/nonpayable/v1bad"),
  make(path+"?order=1"),
  make("https://evil.example/api/checkout/nonpayable/v1"),
 ];
 for(const req of cases){
  assert.equal(isTrustedNonpayableCheckoutEnvelopeV1(req),false);
  assert.equal(req.bodyUsed,false);
 }
});
test("legacy payment checkout route remains an unconditional 503",()=>{
 const legacy=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(legacy,/export async function POST\(\)\s*\{\s*return unavailable\(\);/);
 assert.match(legacy,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(legacy,/status:503/);
});
test("new route refuses early and cannot run without approved release",()=>{
 const route=readFileSync("src/app/api/checkout/nonpayable/v1/route.ts","utf8");
 const release=route.indexOf("if(!isRetailNonpayableSubmissionEnabledV1(process.env))");
 const earlyReturn=route.indexOf("return unavailable();");
 const csrf=route.indexOf("if(!isTrustedNonpayableCheckoutEnvelopeV1(request))");
 const auth=route.indexOf("await createSupplierServerClient()");
 const pool=route.indexOf("createRetailCheckoutServerPoolV1(process.env,pg.Pool)");
 const admission=route.indexOf("admitPrivateNonpayableRetailOrderV1({");
 assert.ok(release>=0&&earlyReturn>release&&csrf>earlyReturn&&
  auth>csrf&&pool>auth&&admission>pool);
 assert.match(route,/user\.email_confirmed_at/);
 assert.match(route,/createRetailPostgresAdmissionDependenciesV1/);
 assert.match(route,/maxDuration=20/);
 assert.doesNotMatch(route,/NEXT_PUBLIC_|createInvoice|sendPayout|service_role|console\.|\.rpc\(/);
});
test("customer UX transmits PII only after confirmed session, reviewed delivery and explicit consent",()=>{
 const panel=readFileSync("src/app/cart/nonpayable-order-panel.tsx","utf8");
 const delivery=readFileSync("src/app/cart/delivery-details-form.tsx","utf8");
 const page=readFileSync("src/app/cart/page.tsx","utf8");
 assert.match(panel,/enabled&&signedIn&&verifiedStock&&delivery!==null/);
 assert.match(panel,/checked=\{agreed\}/);
 assert.match(panel,/if\(!eligible\|\|!agreed\|\|submitting\|\|receipt\)return/);
 assert.match(panel,/crypto\.randomUUID\(\)/);
 assert.match(panel,/fetch\("\/api\/checkout\/nonpayable\/v1"/);
 assert.match(panel,/canPay===false/);
 assert.match(panel,/invoiceCreated===false/);
 assert.match(panel,/No payment was taken/);
 assert.match(delivery,/onReviewed\?\.\(validated\)/);
 assert.match(page,/isRetailNonpayableSubmissionEnabledV1\(process\.env\)/);
 assert.doesNotMatch(panel,/localStorage|sessionStorage|console\.|window\.location|URLSearchParams/);
});
