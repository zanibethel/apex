import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DEMO_ITEMS} from "../src/lib/checkout/preview-model.mjs";
import {
 DEMO_CART_STORAGE_KEY,DEMO_CART_VERSION,EMPTY_DEMO_CART,
 normalizeDemoCart,changeDemoCartQuantity,demoCartCount,demoCartSubtotal,
 serializeDemoCart,parseDemoCart,
} from "../src/lib/cart/demo-cart.mjs";

test("empty basket, bounded add/remove quantities and accurate sample subtotal",()=>{
 assert.deepEqual(EMPTY_DEMO_CART,{"demo-shirt":0,"demo-bottle":0});
 const one=changeDemoCartQuantity(EMPTY_DEMO_CART,"demo-shirt",2);
 assert.equal(demoCartCount(one),2);
 assert.equal(demoCartSubtotal(one),6800);
 const two=changeDemoCartQuantity(one,"demo-bottle",3);
 assert.equal(demoCartCount(two),5);
 assert.equal(demoCartSubtotal(two),12500);
 assert.equal(changeDemoCartQuantity(two,"demo-shirt",0)["demo-shirt"],0);
 assert.equal(changeDemoCartQuantity(two,"demo-bottle",8)["demo-bottle"],5);
 assert.equal(changeDemoCartQuantity(two,"unknown-id",1)["unknown-id"],undefined);
 assert.deepEqual(EMPTY_DEMO_CART,{"demo-shirt":0,"demo-bottle":0});
});

test("cart refuses external published catalog IDs, negative and forged quantities",()=>{
 const injected=normalizeDemoCart({
  "demo-shirt":-1,"demo-bottle":5000,"real-product-id":3,
 });
 assert.deepEqual(injected,EMPTY_DEMO_CART);
 const withDecimals=normalizeDemoCart({"demo-shirt":1.7,"demo-bottle":NaN});
 assert.deepEqual(withDecimals,EMPTY_DEMO_CART);
 const change=changeDemoCartQuantity({"demo-shirt":1},"../../api/v1/stores/secret",3);
 assert.equal(Object.keys(change).length,DEMO_ITEMS.length);
 assert.equal(demoCartCount(change),1);
});

test("only demo IDs and quantities persist, using a strictly versioned payload",()=>{
 const order={"demo-shirt":3,"demo-bottle":1};
 const json=serializeDemoCart(order);
 assert.equal(DEMO_CART_STORAGE_KEY,"apex_demo_cart_v1");
 assert.equal(DEMO_CART_VERSION,1);
 assert.deepEqual(JSON.parse(json),{version:1,quantities:order});
 assert.deepEqual(parseDemoCart(json),order);
 for(const value of [
  "not json","",
  JSON.stringify({version:2,quantities:order}),
  JSON.stringify({version:1,quantities:{"demo-shirt":1,"actual-peptide-id":1}}),
  JSON.stringify({version:1,quantities:null}),
  JSON.stringify({version:1,quantities:[]}),
 ]) assert.deepEqual(parseDemoCart(value),EMPTY_DEMO_CART);
 assert.doesNotMatch(json,/email|address|phone|payment|btc|wallet/i);
});

test("header + catalog + checkout reuse one client-side cart context",()=>{
 const layout=readFileSync("src/app/layout.tsx","utf8");
 const provider=readFileSync("src/app/demo-cart.tsx","utf8");
 const catalog=readFileSync("src/app/catalog/page.tsx","utf8");
 const shelf=readFileSync("src/app/catalog/demo-catalog-shelf.tsx","utf8");
 const checkout=readFileSync("src/app/checkout/preview/checkout-preview.tsx","utf8");
 assert.match(layout,/DemoCartProvider enabled=\{process\.env\.APEX_CHECKOUT_MODE==="demo"\}/);
 assert.match(layout,/DemoCartToggle/);
 assert.match(catalog,/DemoCatalogShelf/);
 assert.match(shelf,/Add to demo cart/);
 assert.match(shelf,/DEMO_ITEMS\.map/);
 assert.match(provider,/role="dialog" aria-modal="true"/);
 assert.match(provider,/onClick=\{close\}/);
 assert.match(provider,/event\.key==="Escape"/);
 assert.match(provider,/Continue to demo checkout/);
 assert.match(provider,/DEMO_CART_STORAGE_KEY/);
 assert.match(provider,/demoCartCount\(quantities\)/);
 assert.match(checkout,/const \{quantities\}=cart/);
 assert.doesNotMatch(checkout,/useState<Record<string,number>>/);
 assert.match(checkout,/disabled=\{!total\.items\.length\}/);
 assert.match(checkout,/Browse sample items/);
 for(const code of [provider,shelf,checkout]){
  assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\baxios\b/);
  assert.doesNotMatch(code,/\/api\/v1\/stores\//);
  assert.doesNotMatch(code,/btc-?pay\.com|lightning:|bitcoin:/i);
 }
});

test("cart cannot use untrusted product price or create invoices",()=>{
 const code=readFileSync("src/lib/cart/demo-cart.mjs","utf8");
 const provider=readFileSync("src/app/demo-cart.tsx","utf8");
 assert.match(code,/DEMO_ITEMS/);
 assert.doesNotMatch(code,/fetch\(|axios|api\/|serverAction|\.insert\(/);
 assert.doesNotMatch(provider,/\/api\/|\bfetch\s*\(|Greenfield|BTCPay|prism/i);
 assert.doesNotMatch(provider,/sessionStorage|indexedDB|document\.cookie/);
 assert.match(provider,/window\.localStorage/);
});


test("mobile cart is content-sized, and header uses separated borderless touch targets",()=>{
 const cart=readFileSync("src/app/demo-cart.css","utf8");
 const header=readFileSync("src/app/globals.css","utf8");
 const menu=readFileSync("src/app/account-menu.tsx","utf8");
 const c=cart.slice(cart.indexOf("/* A content-sized shopping drawer"));
 const h=header.slice(header.indexOf("/* Compact, separated cart/menu actions"));
 assert.ok(c.startsWith("/* A content-sized shopping drawer"));
 assert.match(c,/width:min\(354px,calc\(100vw - 28px\)\)/);
 assert.match(c,/height:auto/);
 assert.match(c,/max-height:calc\(100dvh - 94px\)/);
 assert.match(c,/\.apex-cart-lineitems\{flex:0 1 auto/);
 assert.match(h,/nav\.apex-navigation\{[\s\S]*?gap:14px/);
 assert.match(h,/\.apex-cart-toggle,[\s\S]*?\.apex-menu-toggle\{[\s\S]*?width:44px;min-width:44px;height:44px;[\s\S]*?border:0/);
 assert.match(h,/nav\.apex-navigation\{gap:12px\}/);
 assert.match(menu,/<svg aria-hidden="true" viewBox="0 0 24 24"/);
 assert.match(menu,/aria-label="Navigation menu"/);
 const provider=readFileSync("src/app/demo-cart.tsx","utf8");
 assert.match(provider,/No purchases or payments/);
});
