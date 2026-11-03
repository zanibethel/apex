import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 resolveTaxCloudBinding,providerStatusPublic,canQuoteProduct,
 makeTaxCloudCart,verifyTaxCloudCart,taxCloudEndpoint,
 TAXCLOUD_ORIGIN,
} from "../src/lib/tax/taxcloud-v3-contract.mjs";

const STORE="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const STORE2="62000000-0000-0000-0000-000000000001";
const CONNECTION="b220b4f0-dd25-4192-84d0-03b13547c001";
const PRODUCT="64000000-0000-0000-0000-000000000001";
const ORIGIN={countryCode:"US",line1:"400 Safe Test St",city:"Lubbock",
 state:"TX",zip:"79401"};
const DEST={countryCode:"US",line1:"501 Test Plaza",city:"Austin",
 state:"TX",zip:"78701"};
const KEYENV="APEX_TAXCLOUD_KEY_PRIMARY";
const BINDING=[{apexStoreId:STORE,connectionId:CONNECTION,keyEnv:KEYENV,
 origin:ORIGIN,productRules:{[PRODUCT]:{tic:0,reviewed:true}}}];
const ENV={[KEYENV]:"private-test-token-16chars"};
const resolve=(values=BINDING,storeId=STORE,env=ENV)=>
 resolveTaxCloudBinding(JSON.stringify(values),storeId,env);
const sample={
 connectionId:CONNECTION,origin:ORIGIN,destination:DEST,
 productId:PRODUCT,quantity:1,unitPriceCents:10000,
 discountCents:2000,shippingCents:795,tic:0,
 customerId:"apex-admin-test-customer",
};
const request=()=>makeTaxCloudCart(sample);
const accepted=()=>({
 connectionId:CONNECTION,
 items:[{
  cartId:"merchant-cart-123456",currency:{currencyCode:"USD"},
  origin:ORIGIN,destination:DEST,
  lineItems:[
   {index:0,itemId:PRODUCT,quantity:1,originalPrice:100,price:80,
    tic:0,tax:{amount:6.60,rate:0.0825}},
   {index:1,itemId:"APEX-SHIPPING",quantity:1,price:7.95,
    tic:11010,tax:{amount:0.60,rate:0.07547}},
  ],
 }],
});

test("TaxCloud bindings use a unique credential per private store and never expose it",()=>{
 const b=resolve();
 assert.equal(b.status,"ready");
 assert.equal(b.key,ENV[KEYENV]);
 assert.equal(b.productRules[PRODUCT].tic,0);
 const status=providerStatusPublic(b);
 assert.equal(status.connected,false);
 assert.equal(status.classifiedProducts,1);
 assert.equal(JSON.stringify(status).includes(ENV[KEYENV]),false);
 assert.equal(resolve(BINDING,STORE2).status,"no_store_binding");
 assert.equal(resolve(BINDING,STORE,{}).status,"missing_key");
 assert.equal(resolve("not json",STORE).status,"invalid_bindings");
 assert.equal(resolve([...BINDING,{...BINDING[0]}]).status,"invalid_bindings");
 assert.equal(resolve([{...BINDING[0],keyEnv:"KEY"}]).status,"invalid_bindings");
 assert.equal(resolve([{...BINDING[0],origin:{...ORIGIN,zip:"BAD"}}]).status,
  "invalid_origin");
 assert.equal(resolve([{...BINDING[0],
  productRules:{[PRODUCT]:{tic:"0",reviewed:true}}}]).status,
  "invalid_classifications");
});
test("unreviewed, unmapped and unchecked tax-free products fail closed",()=>{
 const b=resolve();
 assert.equal(canQuoteProduct(b,PRODUCT,true).ok,true);
 assert.equal(canQuoteProduct(b,PRODUCT,false).ok,false);
 assert.equal(canQuoteProduct(b,STORE2,true).ok,false);
 const ref=[{...BINDING[0],productRules:{
  [PRODUCT]:{tic:11220,reviewed:true,
   taxFreeBasisRef:"merchant-reviewed-classification/2026-11"},
 }}];
 const classified=resolve(ref);
 assert.equal(canQuoteProduct(classified,PRODUCT,false).ok,true);
 assert.equal(canQuoteProduct(classified,PRODUCT,false).tic,11220);
});
test("cart payload matches TaxCloud documented v3 shape and keeps shipping separate",()=>{
 const r=request();
 assert.ok(r);
 const cart=r.body.items[0];
 assert.deepEqual(cart.currency,{currencyCode:"USD"});
 assert.equal(cart.customerId,sample.customerId);
 assert.deepEqual(cart.origin,ORIGIN);
 assert.deepEqual(cart.destination,DEST);
 assert.equal(cart.lineItems.length,2);
 assert.deepEqual(cart.lineItems[0],{
  index:0,itemId:PRODUCT,price:100,quantity:1,tic:0});
 assert.deepEqual(cart.lineItems[1],{
  index:1,itemId:"APEX-SHIPPING",price:7.95,quantity:1,tic:11010});
 assert.deepEqual(cart.discounts,{
  orderDiscount:{type:"amount",value:20}});
 assert.equal(makeTaxCloudCart({...sample,destination:{...DEST,state:"XX"}}),null);
 assert.equal(makeTaxCloudCart({...sample,discountCents:10001}),null);
 assert.equal(makeTaxCloudCart({...sample,customerId:""}),null);
 assert.equal(makeTaxCloudCart({...sample,tic:-1}),null);
});
test("zero shipping omits shipping item; free-shipping code does not invent a tax exemption",()=>{
 const req=makeTaxCloudCart({...sample,discountCents:0,shippingCents:0});
 assert.ok(req);
 assert.equal(req.body.items[0].lineItems.length,1);
 assert.equal(req.body.items[0].discounts,undefined);
 assert.equal(req.body.items[0].lineItems[0].tic,0);
});
test("provider response must match exact origin, destination, currency, TIC and amounts",()=>{
 const result=verifyTaxCloudCart(accepted(),request().expected);
 assert.ok(result);
 assert.equal(result.provider,"taxcloud_v3");
 assert.equal(result.taxEstimateCents,720);
 assert.equal(result.productTaxCents,660);
 assert.equal(result.shippingTaxCents,60);
 assert.equal(result.preTaxTotalCents,8795);
 assert.equal(result.estimatedTotalCents,9515);
 assert.equal(result.quoteFinalized,false);
 assert.equal(result.canCreateInvoice,false);
 assert.equal(result.canCreateOrder,false);
 assert.equal(result.canPay,false);
 assert.equal(result.expiresAt,null);
 for(const bad of [
  {connectionId:STORE2},
  {items:[]},
  {items:[{...accepted().items[0],destination:{...DEST,zip:"99999"}}]},
  {items:[{...accepted().items[0],origin:{...ORIGIN,city:"Other"}}]},
  {items:[{...accepted().items[0],currency:{currencyCode:"EUR"}}]},
  {items:[{...accepted().items[0],lineItems:[
   {...accepted().items[0].lineItems[0],tic:100},
   accepted().items[0].lineItems[1]]}]},
  {items:[{...accepted().items[0],lineItems:[
   {...accepted().items[0].lineItems[0],price:81},
   accepted().items[0].lineItems[1]]}]},
  {items:[{...accepted().items[0],lineItems:[
   {...accepted().items[0].lineItems[0],tax:{amount:NaN}},
   accepted().items[0].lineItems[1]]}]},
  {items:[{...accepted().items[0],lineItems:[
   accepted().items[0].lineItems[0],
   {...accepted().items[0].lineItems[1],price:0}]}]},
 ]){
  assert.equal(verifyTaxCloudCart({...accepted(),...bad},request().expected),null,
   JSON.stringify(bad));
 }
});
test("payment and order creation endpoints are not available to adapter",()=>{
 assert.equal(TAXCLOUD_ORIGIN,"https://api.v3.taxcloud.com");
 assert.equal(taxCloudEndpoint(CONNECTION,"ping"),
  "https://api.v3.taxcloud.com/tax/connections/"+CONNECTION+"/ping");
 assert.equal(taxCloudEndpoint(CONNECTION,"carts"),
  "https://api.v3.taxcloud.com/tax/connections/"+CONNECTION+"/carts");
 for(const path of ["orders","carts/orders","refunds","/carts/orders"])
  assert.equal(taxCloudEndpoint(CONNECTION,path),null);
});
test("server-only gateway denies missing credentials and has no invoice/checkout capability",()=>{
 const server=readFileSync("src/lib/tax/taxcloud-v3-server.ts","utf8");
 const action=readFileSync("src/app/admin/checkout-review/destination-charge-actions.ts","utf8");
 const ui=readFileSync("src/app/admin/checkout-review/admin-destination-charge-form.tsx","utf8");
 const admin=readFileSync("src/app/admin/tax/page.tsx","utf8");
 assert.match(server,/import "server-only"/);
 assert.match(server,/APEX_TAXCLOUD_PRIVATE_ESTIMATES_ENABLED/);
 assert.match(server,/requestPrivateTaxCloudEstimate/);
 assert.match(server,/redirect:"error",cache:"no-store"/);
 assert.match(server,/AbortSignal.timeout\(5000\)/);
 assert.match(action,/isVerifiedPlatformAdmin/);
 assert.match(action,/requestPrivateTaxCloudEstimate/);
 assert.match(action,/subtotalMatchesDisplay/);
 assert.match(ui,/Final payable total/);
 assert.match(ui,/TaxCloud/);
 assert.match(admin,/isVerifiedPlatformAdmin/);
 assert.doesNotMatch(server,/carts\/orders|commitTransaction|sendInvoice/i);
 assert.doesNotMatch(action,/APEX_TAXCLOUD_KEY_/);
});
