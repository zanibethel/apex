import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluatePrivateCheckoutReadiness,PRIVATE_CHECKOUT_READINESS_CHECKS}
 from "../src/lib/checkout/private-cart-readiness.mjs";

const complete=Object.fromEntries(
 PRIVATE_CHECKOUT_READINESS_CHECKS.map(check=>[check.key,true])
);
const privateSnapshot={
 status_code:"public_release_disabled",
 effective_public:false,
 checks:{...complete,public_release_enabled:false},
};

test("private checkout admission follows server-side release check schema",()=>{
 assert.equal(PRIVATE_CHECKOUT_READINESS_CHECKS.length,9);
 assert.deepEqual(PRIVATE_CHECKOUT_READINESS_CHECKS.map(c=>c.key),[
  "supplier_requested","admin_clear","same_supplier_identity_clear",
  "content_review_clear","product_setup_complete","stock_available",
  "supplier_authorized","product_authorized","public_release_enabled",
 ]);
 const result=evaluatePrivateCheckoutReadiness(privateSnapshot,"demo");
 assert.equal(result.mode,"demo");
 assert.equal(result.status,"blocked");
 assert.equal(result.verifiedPrivateReleaseReadback,true);
 assert.equal(result.privateStatusCode,"public_release_disabled");
 assert.equal(result.effectivePublic,false);
 assert.equal(result.canAddToRealCart,false);
 assert.equal(result.canQuoteRealProduct,false);
 assert.equal(result.canCreateOrder,false);
 assert.equal(result.canCreatePayment,false);
 assert.ok(result.blockers.includes("public_release_enabled"));
 assert.ok(result.blockers.includes("server_order_admission_disabled"));
 assert.ok(result.blockers.includes("checkout_provider_not_approved"));
});

test("unknown, partial, missing or forged release status always blocks cart and payment",()=>{
 const variants=[
  null,undefined,{},[],false,1,"ready",
  {effective_public:true,status_code:"ready",checks:complete},
  {effective_public:false,status_code:"",checks:complete},
  {effective_public:false,status_code:"ready",checks:{...complete,stock_available:"true"}},
  {effective_public:false,status_code:"ready",checks:{"supplier_requested":true}},
  {effective_public:false,status_code:"ready",checks:null},
  {effective_public:false,status_code:"ready",checks:[]},
 ];
 for(const value of variants){
  const result=evaluatePrivateCheckoutReadiness(value,"demo");
  assert.equal(result.verifiedPrivateReleaseReadback,false);
  assert.equal(result.status,"blocked");
  assert.equal(result.privateStatusCode,"unavailable");
  assert.ok(result.blockers.includes("private_release_decision_unverified"));
  assert.equal(result.canAddToRealCart,false);
  assert.equal(result.canCreatePayment,false);
 }
});

test("even an implausibly all-green internal precheck never turns on checkout",()=>{
 for(const mode of ["demo","live","off","production",undefined]){
  const snapshot={status_code:"public_release_disabled",
   effective_public:false,checks:complete};
  const result=evaluatePrivateCheckoutReadiness(snapshot,mode);
  assert.equal(result.status,"blocked");
  assert.equal(result.effectivePublic,false);
  assert.equal(result.canQuoteRealProduct,false);
  assert.equal(result.canAddToRealCart,false);
  assert.equal(result.canCreateOrder,false);
  assert.equal(result.canCreatePayment,false);
  assert.ok(result.blockers.includes("server_order_admission_disabled"));
  assert.equal(result.mode,mode==="demo"?"demo":"disabled");
 }
});

test("private checkout admin view requires verified role and signed-in user",()=>{
 const admin=readFileSync("src/app/admin/checkout-readiness/page.tsx","utf8");
 const dashboard=readFileSync("src/app/admin/page.tsx","utf8");
 assert.match(admin,/createSupplierServerClient\(\)/);
 assert.match(admin,/\.auth\.getUser\(\)/);
 assert.match(admin,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(admin,/redirect\("\/admin\/sign-in"\)/);
 assert.match(admin,/get_private_release_readiness/);
 assert.match(admin,/BATCH_SIZE=8/);
 assert.match(admin,/LIMIT=40/);
 assert.match(admin,/evaluatePrivateCheckoutReadiness/);
 assert.match(admin,/checkoutMode=process\.env\.APEX_CHECKOUT_MODE==="demo"/);
 assert.match(admin,/canAddToRealCart|CHECKOUT BLOCKED/);
 assert.match(dashboard,/href: "\/admin\/checkout-readiness"/);
 assert.doesNotMatch(admin,/\bfetch\s*\(|\.insert\(|\.update\(|\.delete\(|service_role|SUPABASE_SECRET|NEXT_PUBLIC_/);
 assert.doesNotMatch(admin,/createInvoice|paymentUrl|walletAddress|\.rpc\("set_/);
});

test("published catalog and demo cart remain separate from private checkout candidates",()=>{
 const catalog=readFileSync("src/app/catalog/page.tsx","utf8");
 const cart=readFileSync("src/lib/cart/demo-cart.mjs","utf8");
 const quote=readFileSync("src/lib/checkout/private-cart-readiness.mjs","utf8");
 assert.match(catalog,/readPublishedCatalog/);
 assert.match(cart,/DEMO_ITEMS/);
 assert.doesNotMatch(cart,/public_product|products\s*\(|product_id|store_id/);
 assert.doesNotMatch(quote,/\bfetch\s*\(|apiKey|secret|createInvoice|product_price/);
 assert.match(quote,/canAddToRealCart:false/);
 assert.match(quote,/canCreatePayment:false/);
});
