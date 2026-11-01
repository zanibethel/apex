import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 calculateDemoServerQuote,validateDemoQuoteRequest,DemoQuoteInputError,
} from "../src/lib/checkout/server-demo-quote.mjs";
import {requestDemoServerQuote} from "../src/lib/checkout/demo-quote-client.mjs";

const raw={items:[{id:"demo-shirt",quantity:1},{id:"demo-bottle",quantity:2}],
 shipping:"standard",coupon:"DEMO10"};
test("server owns canonical demo prices, discount, shipping and integer totals",()=>{
 const quote=calculateDemoServerQuote(raw,{now:1_800_000_000_000});
 assert.equal(quote.mode,"demo_only");
 assert.equal(quote.payable,false);
 assert.equal(quote.canCreateOrder,false);
 assert.equal(quote.canCreatePayment,false);
 assert.equal(quote.currency,"USD");
 assert.equal(quote.subtotalCents,7200);
 assert.equal(quote.discountCents,720);
 assert.equal(quote.shippingCents,600);
 assert.equal(quote.illustrativeTotalCents,7080);
 assert.equal(quote.illustrativeBtcSats,"70800");
 assert.equal(quote.illustrativeUsdPerBtcCents,10000000);
 assert.equal(quote.finalAmountDueCents,null);
 assert.equal(quote.taxStatus,"not_calculated");
 assert.equal(quote.expiresAt,new Date(1_800_000_300_000).toISOString());
 assert.deepEqual(quote.items.map(item=>item.lineCents),[3400,3800]);
});

test("server rejects client prices, unknown real SKUs, duplicate lines, zero/cart abuse",()=>{
 const invalid=[
  null,[],{}, {items:[],shipping:"standard",coupon:""},
  {items:[{id:"real-product-id",quantity:1}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:1,unitCents:1}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:1},{id:"demo-shirt",quantity:2}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:0}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:6}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:1.2}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:"1"}],shipping:"standard",coupon:""},
  {items:[{id:"demo-shirt",quantity:1}],shipping:"next_day",coupon:""},
  {items:[{id:"demo-shirt",quantity:1}],shipping:"standard",coupon:"SAVE90"},
  {...raw,clientTotalCents:1},
  {...raw,guestEmail:"someone@example.com"},
  {...raw,bitcoinAddress:"x"},
  {...raw,items:[{id:"demo-bottle",quantity:1},{id:"demo-shirt",quantity:2},{id:"extra",quantity:1}]},
 ];
 for(const payload of invalid)
  assert.throws(()=>calculateDemoServerQuote(payload),DemoQuoteInputError);
 assert.throws(()=>calculateDemoServerQuote(raw,{now:NaN}),DemoQuoteInputError);
});

test("server quote is independent of client line order and frozen against accidental mutation",()=>{
 const q=calculateDemoServerQuote({
  items:[{id:"demo-bottle",quantity:2},{id:"demo-shirt",quantity:1}],
  shipping:"standard",coupon:"DEMO10",
 },{now:1_800_000_000_000});
 assert.equal(q.illustrativeTotalCents,7080);
 assert.equal(Object.isFrozen(q),true);
 assert.ok(q.items.every(Object.isFrozen));
 assert.deepEqual(validateDemoQuoteRequest(raw).quantities,{"demo-shirt":1,"demo-bottle":2});
});

test("browser quote request transmits only demo SKU, quantity, shipping and coupon",async()=>{
 let captured;
 const mockFetch=async(url,opts)=>{
  captured={url,opts};
  return {ok:true,json:async()=>calculateDemoServerQuote(raw,{now:Date.now()})};
 };
 const result=await requestDemoServerQuote({
  quantities:{"demo-shirt":1,"demo-bottle":2},
  shipping:"standard",coupon:"DEMO10",guest:{email:"never@example.com"},
 },mockFetch);
 assert.equal(result.payable,false);
 assert.equal(captured.url,"/api/checkout/quote-preview");
 assert.equal(captured.opts.method,"POST");
 assert.equal(captured.opts.credentials,"same-origin");
 assert.equal(captured.opts.cache,"no-store");
 assert.deepEqual(JSON.parse(captured.opts.body),raw);
 assert.doesNotMatch(captured.opts.body,/guest|email|address|priceCents|wallet/i);
});

test("nonpayable response verifier rejects spoofed payable, missing tax and expired quotes",async()=>{
 const good=calculateDemoServerQuote(raw,{now:Date.now()});
 for(const patch of [
  {payable:true},{canCreateOrder:true},{canCreatePayment:true},
  {mode:"real"},{currency:"BTC"},{taxStatus:"calculated"},
  {finalAmountDueCents:7080},{illustrativeBtcSats:"abc"},
  {illustrativeTotalCents:-1},{expiresAt:"2000-01-01T00:00:00.000Z"},
 ]){
  const fake=async()=>({ok:true,json:async()=>({...good,...patch})});
  await assert.rejects(requestDemoServerQuote({
   quantities:{"demo-shirt":1,"demo-bottle":2},shipping:"standard",coupon:"DEMO10",
  },fake));
 }
 await assert.rejects(requestDemoServerQuote({
  quantities:{"demo-shirt":1},shipping:"standard",coupon:"",
 },async()=>({ok:false})));
});

test("route is demo only, origin checked, bounded, nonpayable, no DB/BTCPay writes",()=>{
 const route=readFileSync("src/app/api/checkout/quote-preview/route.ts","utf8");
 const checkout=readFileSync("src/app/checkout/preview/checkout-preview.tsx","utf8");
 const server=readFileSync("src/lib/checkout/server-demo-quote.mjs","utf8");
 assert.match(route,/process\.env\.APEX_CHECKOUT_MODE!=="demo"/);
 assert.match(route,/new URL\(request\.url\)\.origin/);
 assert.match(route,/fetchSite==="cross-site"/);
 assert.match(route,/MAX_BYTES=2048/);
 assert.match(route,/calculateDemoServerQuote\(JSON\.parse\(body\)\)/);
 assert.match(route,/Cache-Control/);
 assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.rpc\(|\bfetch\s*\(|Greenfield|BTCPay/i);
 assert.match(server,/payable:false/);
 assert.match(server,/canCreateOrder:false/);
 assert.match(server,/canCreatePayment:false/);
 assert.match(checkout,/requestDemoServerQuote\(\{quantities,shipping,coupon\}\)/);
 assert.match(checkout,/quoteIsCurrent&&serverQuote/);
 assert.match(checkout,/quotePending/);
 assert.match(checkout,/Server-verified fictional total/);
});
