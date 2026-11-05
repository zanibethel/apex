import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CUSTOMER_CHECKOUT_HANDOFF_VERSION,parseCustomerCheckoutHandoffV1}
 from "../src/lib/checkout/customer-handoff-v1.mjs";
const id="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const product1="f0000000-0000-0000-0000-000000000001";
const product2="f0000000-0000-0000-0000-000000000002";
const details={
 firstName:" Pat ",lastName:" Customer ",email:" P@Example.com ",
 phone:"",address1:"100 Market Street",address2:"",
 city:"Lubbock",state:"TX",postalCode:"79401",
};
const request={
 schemaVersion:1,requestId:id,
 cart:{items:[{product_id:product1,quantity:2},{product_id:product2,quantity:1}],
 code:"",boxSize:"auto"},
 delivery:details,
};
test("handoff v1 normalizes only client selections and protected delivery",()=>{
 assert.equal(CUSTOMER_CHECKOUT_HANDOFF_VERSION,1);
 const parsed=parseCustomerCheckoutHandoffV1(request);
 assert.equal(parsed.ok,true);
 assert.equal(parsed.request.delivery.email,"p@example.com");
 assert.equal(parsed.request.delivery.firstName,"Pat");
 assert.equal(parsed.request.cart.items.length,2);
 assert.equal(parsed.request.cart.items[0].quantity,2);
 assert.equal(parsed.request.cart.boxSize,"auto");
 assert.equal(Object.isFrozen(parsed.request),true);
});
test("handoff v1 denies forged prices, stock, payments and extra fields",()=>{
 for(const value of [
  {...request,unitPriceCents:1},
  {...request,checkoutAmountCents:1},
  {...request,invoiceId:"fake"},
  {...request,schemaVersion:2},
  {...request,requestId:product1},
  {...request,cart:{...request.cart,items:[{...request.cart.items[0],priceCents:1}]}},
  {...request,cart:{...request.cart,items:[request.cart.items[0],request.cart.items[0]]}},
  {...request,cart:{...request.cart,code:"invalid!"}},
  {...request,cart:{...request.cart,code:"DEMO10",boxSize:"overnight"}},
  {...request,cart:{...request.cart,canPay:true}},
  {...request,delivery:{...details,country:"US"}},
  {...request,delivery:{...details,email:"not-an-email"}},
 ]){
  assert.equal(parseCustomerCheckoutHandoffV1(value).ok,false,JSON.stringify(value).slice(0,100));
 }
});
test("route cannot receive PII or create order, payment, stock or label",()=>{
 const api=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(api,/export async function POST/);
 assert.match(api,/return unavailable\(\)/);
 assert.match(api,/status:503/);
 assert.match(api,/no-store, private/);
 assert.match(api,/Referrer-Policy/);
 assert.doesNotMatch(api,/request\.json\(|request\.text\(|fetch\(|console\.|\.insert\(|\.update\(|createInvoice|sendEmail/);
});
