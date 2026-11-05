import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HELD_HEADER_PAGE_SIZE,HELD_HEADER_LAST_PAGE,
 parseHeldHeaderPage,heldHeaderPageHref}
 from "../src/lib/supplier/held-order-header-page.mjs";
const read=path=>readFileSync(path,"utf8");

test("original held-record pagination remains bounded and deterministic",()=>{
 assert.equal(HELD_HEADER_PAGE_SIZE,25);
 assert.equal(HELD_HEADER_LAST_PAGE,40);
 for(const [raw,expected] of [
  [undefined,0],["0",0],["1",1],["39",39],["40",40],
  ["41",0],["99",0],["100",0],["01",0],["-1",0],
  ["1.5",0],["1e2",0],[" 1",0],[["2"],0],[3,0],
  ["<script>",0],["9999999999999999999999",0],
 ])assert.equal(parseHeldHeaderPage(raw),expected);
 assert.equal(heldHeaderPageHref(0),
  "/supplier/reports/order-foundation/headers");
 assert.equal(heldHeaderPageHref(40),
  "/supplier/reports/order-foundation/headers?page=40");
 for(const invalid of [-1,41,1.3,Infinity,NaN,"1"])
  assert.throws(()=>heldHeaderPageHref(invalid),RangeError);
});

test("server-only supplier page uses authenticated workspace and scoped RPC",()=>{
 const page=read("src/app/supplier/reports/order-foundation/headers/page.tsx");
 assert.match(page,/getSupplierWorkspace/);
 assert.match(page,/if\(!workspace\)redirect\("\/supplier\/sign-in"\)/);
 assert.match(page,/workspace\.stores\.map/);
 assert.match(page,/workspace\.client\.rpc\(/);
 assert.match(page,/"get_supplier_held_order_headers"/);
 assert.match(page,/p_store_id:store\.id/);
 assert.match(page,/p_limit:HELD_HEADER_PAGE_SIZE/);
 assert.match(page,/p_offset:offset/);
 assert.match(page,/parseSupplierHeldOrderHeaders/);
 assert.match(page,/headers=error\?null:/);
 assert.match(page,/dynamic="force-dynamic"/);
 assert.match(page,/index:false,follow:false/);
 assert.doesNotMatch(page,/createClient\(|service_role|supabaseAdmin|\bf etch\(/);
});

test("never display individual purchased goods or delivery details in headers",()=>{
 const page=read("src/app/supplier/reports/order-foundation/headers/page.tsx");
 for(const field of ["order.reference","order.purchasedAt",
  "order.recordedSaleState","order.storedLineCount","order.destinationSealed"])
  assert.ok(page.includes(field),field);
 for(const forbidden of [
  "order.lines","order.sku","order.title","order.totalCents",
  "order.address","order.email","order.phone","order.tracking",
  "order.invoice","order.price","decryptAddress","purchaseLabel",
  "markShipped","sendEmail(","checkoutOrder(",
 ])assert.ok(!page.includes(forbidden),"forbidden: "+forbidden);
 assert.match(page,/HELD — REVIEW ONLY/);
 assert.match(page,/not independently settled/);
 assert.match(page,/No original held-order records have been captured/);
 assert.match(page,/Order records are unavailable/);
 assert.match(page,/No records on this page/);
 assert.match(page,/Previous page/);
 assert.match(page,/Next page/);
});

test("navigation is available only through supplier reporting",()=>{
 const readiness=read("src/app/supplier/reports/order-foundation/page.tsx");
 assert.match(readiness,/View original held-order records/);
 assert.match(readiness,/\/supplier\/reports\/order-foundation\/headers/);
 const header=read("src/app/supplier/reports/order-foundation/headers/page.tsx");
 assert.match(header,/\/supplier\/reports\/order-foundation/);
 assert.doesNotMatch(header,/href="\/orders|href="\/checkout/);
});
