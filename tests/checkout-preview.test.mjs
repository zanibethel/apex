import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 DEMO_ITEMS,DEMO_RATE_CENTS,applyDemoCoupon,demoTotals,
 formatDemoUsd,formatDemoBtc,validateDemoGuest,normalizeDemoQuantity,
} from "../src/lib/checkout/preview-model.mjs";
import {US_STATE_OPTIONS,resolveDemoState,filterDemoStates,displayDemoState}
 from "../src/lib/checkout/us-states.mjs";

const good={
 firstName:"Demo",lastName:"Customer",email:"demo@example.invalid",
 phone:"",street:"123 Example Way",city:"Sample City",state:"TX",postal:"00000",
};

test("sample catalog is independent of customer/supplier data",()=>{
 assert.equal(DEMO_ITEMS.length,2);
 assert.ok(DEMO_ITEMS.every(item=>item.name.includes("Demo")));
 assert.ok(DEMO_ITEMS.every(item=>Number.isSafeInteger(item.unitCents)&&item.unitCents>0));
 assert.equal(DEMO_RATE_CENTS,10000000);
});

test("default preview totals are transparent integers and only simulated BTC",()=>{
 const a=demoTotals();
 assert.equal(a.items.length,2);
 assert.equal(a.subtotalCents,5300);
 assert.equal(a.discountCents,0);
 assert.equal(a.shippingCents,600);
 assert.equal(a.totalCents,5900);
 assert.equal(a.taxLabel,"Not calculated in demo");
 assert.equal(a.mockSats,"59000");
 assert.equal(formatDemoUsd(a.totalCents),"$59.00");
 assert.equal(formatDemoBtc(a.mockSats),"0.00059000 BTC");
});

test("DEMO10 discounts subtotal, shipping stays separate",()=>{
 const a=demoTotals({quantities:{"demo-shirt":1,"demo-bottle":1},
  shipping:"express",coupon:"DEMO10"});
 assert.equal(a.subtotalCents,5300);
 assert.equal(a.discountCents,530);
 assert.equal(a.shippingCents,1400);
 assert.equal(a.totalCents,6170);
 assert.equal(a.mockSats,"61700");
});

test("discount code is case-insensitive, invalid input does not activate coupon",()=>{
 assert.deepEqual(applyDemoCoupon(" demo10 "),{accepted:true,code:"DEMO10"});
 assert.equal(applyDemoCoupon("SHOULD-NOT-WORK").accepted,false);
 assert.match(applyDemoCoupon("wrong").error,/DEMO10/);
 assert.equal(applyDemoCoupon("").accepted,false);
 assert.equal(demoTotals({coupon:"wrong"}).discountCents,0);
});

test("quantities are bounded and empty cart blocks checkout",()=>{
 assert.equal(normalizeDemoQuantity(-5),0);
 assert.equal(normalizeDemoQuantity(9),5);
 assert.equal(normalizeDemoQuantity(2.5),0);
 const empty=demoTotals({quantities:{"demo-shirt":0,"demo-bottle":0}});
 assert.equal(empty.items.length,0);
 assert.equal(empty.totalCents,0);
 assert.equal(empty.mockSats,"0");
 const max=demoTotals({quantities:{"demo-shirt":999,"demo-bottle":999}});
 assert.equal(max.items[0].quantity,5);
 assert.equal(max.items[1].quantity,5);
 assert.equal(max.totalCents,27100);
});

test("integer satoshis always round upward without floating-point FX multiplication",()=>{
 const cheap=demoTotals({quantities:{"demo-shirt":0,"demo-bottle":1},
  shipping:"standard"});
 assert.equal(cheap.totalCents,2500);
 assert.equal(cheap.mockSats,"25000");
 assert.equal(formatDemoBtc("1"),"0.00000001 BTC");
 assert.equal(formatDemoBtc("invalid"),"—");
});

test("fictional guest validation checks required fields and optional phone",()=>{
 assert.deepEqual(validateDemoGuest(good),{});
 const errors=validateDemoGuest({...good,
  firstName:"",lastName:"",email:"bad",street:"",city:"",state:"ZZ",postal:"abc",
  phone:"!"});
 assert.deepEqual(Object.keys(errors).sort(),
  ["firstName","lastName","email","street","city","state","postal","phone"].sort());
 assert.deepEqual(validateDemoGuest({...good,phone:"(555) 555-0100"}),{});
});

test("preview route cannot initiate orders, requests, wallets, invoice POST, or persistence",()=>{
 const base="src/app/checkout/preview/";
 const source=readFileSync(base+"checkout-preview.tsx","utf8");
 const route=readFileSync(base+"page.tsx","utf8");
 const model=readFileSync("src/lib/checkout/preview-model.mjs","utf8");
 assert.match(route,/CheckoutPreview/);
 assert.match(source,/Simulate payment detected/);
 assert.match(source,/Simulate blockchain confirmation/);
 assert.match(source,/not a scannable Bitcoin QR code/);
 assert.match(source,/noValidate/);
 assert.match(source,/do not enter real personal information/i);
 assert.match(source,/disabled=\{!total\.items\.length\}/);
 for(const text of [source,route,model]){
  assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\baxios\b/);
  assert.doesNotMatch(text,/localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(text,/(?:greenfield|btcpay).*\bPOST\b/i);
  assert.doesNotMatch(text,/\/api\/v1\/stores\//);
  assert.doesNotMatch(text,/\bserverAction\s*\(/);
 }
});

test("public demo release requires explicit server-only demo mode; live never enables payment",()=>{
 const page=readFileSync("src/app/checkout/preview/page.tsx","utf8");
 const source=readFileSync("src/app/checkout/preview/checkout-preview.tsx","utf8");
 const env=readFileSync(".env.example","utf8");
 assert.match(page,/process\.env\.APEX_CHECKOUT_MODE!=="demo"\)notFound\(\)/);
 assert.match(page,/force-dynamic/);
 assert.doesNotMatch(page,/NEXT_PUBLIC_APEX_CHECKOUT_MODE/);
 assert.match(source,/TEST MODE — SIMULATED PAYMENTS ONLY/);
 assert.match(source,/cannot accept Bitcoin, place orders, or trigger shipments/);
 assert.match(source,/Do not send funds or enter real personal information/);
 assert.match(env,/APEX_CHECKOUT_MODE=off/);
 assert.doesNotMatch(env,/APEX_CHECKOUT_MODE=live/);
});


test("state picker includes 50 states plus DC, resolves codes and full names",()=>{
 assert.equal(US_STATE_OPTIONS.length,51);
 assert.equal(new Set(US_STATE_OPTIONS.map(option=>option.code)).size,51);
 assert.deepEqual(resolveDemoState("tx"),{code:"TX",name:"Texas"});
 assert.deepEqual(resolveDemoState(" Texas "),{code:"TX",name:"Texas"});
 assert.deepEqual(resolveDemoState("District of Columbia"),{code:"DC",name:"District of Columbia"});
 assert.equal(resolveDemoState("ZZ"),null);
 assert.equal(displayDemoState("tx"),"Texas (TX)");
 assert.equal(displayDemoState("unknown"),"Choose a state");
});

test("search accepts state name fragments and abbreviations without API calls",()=>{
 assert.equal(filterDemoStates("").length,51);
 assert.deepEqual(filterDemoStates("TeX").map(s=>s.code),["TX"]);
 assert.deepEqual(filterDemoStates("tx").map(s=>s.code),["TX"]);
 assert.deepEqual(filterDemoStates("new").map(s=>s.code),["NH","NJ","NM","NY"]);
 assert.equal(filterDemoStates("not-a-state").length,0);
 assert.deepEqual(validateDemoGuest({...good,state:"Texas"}),{});
 assert.deepEqual(validateDemoGuest({...good,state:"tx"}),{});
 assert.match(validateDemoGuest({...good,state:"ZZ"}).state,/valid state/);
 assert.match(validateDemoGuest({...good,state:"TE"}).state,/valid state/);
});

test("mobile checkout field size avoids iPhone keyboard-induced zoom without disabling pinch zoom",()=>{
 const css=readFileSync("src/app/checkout/preview/checkout-preview.css","utf8");
 const jsx=readFileSync("src/app/checkout/preview/checkout-preview.tsx","utf8");
 assert.match(css,/\.apex-checkout-field input,[\s\S]*?\.apex-state-search\{[\s\S]*?font-size:16px;/);
 assert.doesNotMatch(css,/user-scalable\s*:\s*no|maximum-scale\s*:/i);
 assert.match(jsx,/apex-state-trigger/);
 assert.match(jsx,/role="dialog" aria-modal="true"/);
 assert.match(jsx,/type="search"/);
 assert.match(jsx,/role="listbox"/);
 assert.match(jsx,/stateChoices\.map/);
 assert.match(jsx,/event\.key==="Escape"/);
 assert.match(jsx,/setStateSearch\(event\.target\.value\)/);
 assert.match(jsx,/role="option" aria-selected/);
});


test("State and ZIP share a compact two-column mobile row at all iPhone widths",()=>{
 const css=readFileSync("src/app/checkout/preview/checkout-preview.css","utf8");
 const jsx=readFileSync("src/app/checkout/preview/checkout-preview.tsx","utf8");
 const mobile=css.slice(css.indexOf("/* iPhone checkout refinement:"));
 assert.ok(mobile.startsWith("/* iPhone checkout refinement:"));
 assert.match(mobile,/@media\(max-width:600px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(mobile,/\.apex-checkout-preview \.apex-checkout-state\{grid-column:1 \/ 2\}/);
 assert.match(mobile,/\.apex-checkout-preview \.apex-checkout-postal\{grid-column:2 \/ 3\}/);
 assert.match(mobile,/@media\(max-width:390px\)[\s\S]*\.apex-checkout-state\{[\s\S]*grid-column:1 \/ 2/);
 assert.match(mobile,/@media\(max-width:390px\)[\s\S]*\.apex-checkout-postal\{[\s\S]*grid-column:2 \/ 3/);
 assert.match(mobile,/\.apex-checkout-preview \.apex-checkout-ship\{padding:12px;gap:10px\}/);
 assert.match(mobile,/\.apex-checkout-preview \.apex-checkout-shipping\{margin-top:22px;gap:9px\}/);
 assert.match(css,/\.apex-checkout-preview \.apex-checkout-field input,[\s\S]*?\.apex-state-search\{\s*font-size:16px;/);
 assert.doesNotMatch(css,/user-scalable\s*:\s*no|maximum-scale\s*:/i);
 assert.ok(jsx.includes('name:"state",label:"State"'));
 assert.ok(jsx.includes('name:"postal",label:"ZIP code"'));
 assert.ok(jsx.indexOf('name:"state"')<jsx.indexOf('name:"postal"'));
});
