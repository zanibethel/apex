import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {answerApexEmbed} from "../src/lib/chat/apex-chat.mjs";
const read=p=>readFileSync(p,"utf8");
const id="e18368cf-0adb-432c-8dfc-4cb6e9b47ed7";
const product={id,name:"Example Item",priceCents:1234,currency:"USD",availability:"sold_out",categoryName:"Samples"};
test("catalog prices and product links come from permitted projection",()=>{
 const r=answerApexEmbed("price Example Item",[product],"connected");
 assert.equal(r.items.length,1); assert.equal(r.items[0].price,"$12.34");
 assert.equal(r.items[0].href,"/catalog/product/"+id);
});
test("closed or unavailable public gate never returns products",()=>{
 for(const state of ["disabled","unconfigured","unavailable"]){
  assert.equal(answerApexEmbed("Example Item",[product],state).items.length,0);
 }
});
test("no writes, sales, dosage advice or price inventions",()=>{
 for(const prompt of ["create product","edit product price","publish product","buy the product","how much to inject"]){
  assert.equal(answerApexEmbed(prompt,[product],"connected").items.length,0,prompt);
 }
 assert.equal(answerApexEmbed("unlisted-fictional-name",[product],"connected").items.length,0);
});
test("route reads only approved public storefront feed",()=>{
 const route=read("src/app/api/assistant/route.ts");
 assert.match(route,/readApprovedSoldOutCatalog/);
 assert.doesNotMatch(route,/readPublishedCatalog|supplier_memberships|createSupplierServerClient|service_role|SUPABASE_SECRET|\.insert\(|\.update\(/);
 assert.doesNotMatch(route,/\.from\([\s\S]{0,200}\)\.delete\(/);
 assert.match(route,/products\.map/);
 assert.match(route,/source:"apex-local-code-v1"/);
 assert.match(route,/method:"POST"/);
 assert.match(route,/AbortSignal\.timeout/);
 assert.match(route,/matching=approved\.find/);
 assert.match(route,/callCooperative\(payload,catalog\.products\)/);
});
test("root layout mounts accessible text-only chat, no checkout action",()=>{
 const layout=read("src/app/layout.tsx");
 const ui=read("src/app/apex-assistant.tsx");
 assert.match(layout,/ApexAssistant/);
 assert.match(ui,/aria-label="Apex assistant"/);
 assert.doesNotMatch(ui,/type="file"|accept="image|createInvoice|upload|image_generation/);
});

test("remote response must be source-identified, match approved public listings and use bounded throttling",()=>{
 const route=read("src/app/api/assistant/route.ts");
 assert.match(route,/obj\.source!=="cooperative-code-v1"/);
 assert.match(route,/matching=approved\.find/);
 assert.match(route,/if\(buckets\.size>=500&&!buckets\.has\(ip\)\)return false/);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|service_role|private_product|supplier_import_candidates/);
});


test("mobile chat header stays above sticky site navigation, within the viewport",()=>{
 const css=read("src/app/apex-assistant.css");
 const ui=read("src/app/apex-assistant.tsx");
 assert.match(ui,/Powered by CoOperative Chat/);
 assert.match(css,/\.apex-assistant\{[^}]*z-index:150/);
 assert.match(css,/\.apex-assistant-head\{[^}]*flex-shrink:0/);
 assert.match(css,/height:min\(480px,calc\(100dvh - 155px\)\)/);
 assert.match(css,/safe-area-inset-bottom/);
});
