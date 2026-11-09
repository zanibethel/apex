import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {answerSupplierCatalogMessage,supplierCatalogIntent} from "../src/lib/chat/supplier-catalog.mjs";

const read=path=>readFileSync(path,"utf8");
const p=(id,name,requested=false,options={})=>({
 id,name,sku:"SKU-"+id.slice(-4),priceCents:2599,currency:"USD",active:true,requested,
 adminGate:"clear",republishBlocked:false,availableStock:0,
 category:"Sample",productUpdatedAt:"2026-11-09T00:00:00.000Z",controlChangedAt:null,...options,
});
const rows=[
 p("11111111-1111-1111-1111-111111111111","Sample One"),
 p("22222222-2222-2222-2222-222222222222","Sample Two",true),
 p("33333333-3333-3333-3333-333333333333","Sample Held",false,{adminGate:"hold"}),
];

test("supplier questions list only supplied private records without inventing prices",()=>{
 const r=answerSupplierCatalogMessage("show my products",rows);
 console.log("SUPPLIER CHAT DIAGNOSTIC",JSON.stringify(r));
 assert.equal(r.items.length,3);
 assert.equal(r.items[0].price,"$25.99");
 assert.equal(r.items[0].href,"/supplier/catalog/preview/11111111-1111-1111-1111-111111111111");
 assert.match(r.answer,/private/i);
 assert.equal(answerSupplierCatalogMessage("find no-such-item",rows).items.length,0);
 assert.equal(answerSupplierCatalogMessage("show my products",[]).items.length,0);
});

test("publication text only proposes actions, never performs writes or bypasses holds",()=>{
 assert.equal(supplierCatalogIntent("please publish Sample One"),"publish");
 assert.equal(supplierCatalogIntent("unpublish Sample Two"),"unpublish");
 const r=answerSupplierCatalogMessage("publish",rows);
 console.log("PUBLISH CHAT DIAGNOSTIC",JSON.stringify(r));
 assert.equal(r.items.find(x=>x.name==="Sample One")?.action,"publish");
 assert.equal(r.items.find(x=>x.name==="Sample Two")?.action,null);
 assert.equal(r.items.find(x=>x.name==="Sample Held")?.action,null);
 assert.match(r.answer,/confirm/i);
 assert.match(r.answer,/does not make it publicly available/i);
 const undo=answerSupplierCatalogMessage("unpublish",rows);
 assert.equal(undo.items.length,1);
 assert.equal(undo.items[0].action,"unpublish");
 assert.equal(answerSupplierCatalogMessage("how much to inject",rows).items.length,0);
 assert.doesNotMatch(read("src/lib/chat/supplier-catalog.mjs"),/fetch\(|\.rpc\(|\.insert\(|\.update\(|service_role|SUPABASE_SECRET/);
});

test("API verifies owner or manager on every action and delegates release control to existing audited RPC",()=>{
 const route=read("src/app/api/assistant/supplier/route.ts");
 assert.match(route,/client\.auth\.getUser\(\)/);
 assert.match(route,/from\("supplier_memberships"\)/);
 assert.match(route,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(route,/\.eq\("is_public",false\)/);
 assert.match(route,/stores\?\.length!==1/);
 assert.match(route,/\.eq\("store_id",store\.id\)/);
 assert.match(route,/count!==products\?\.length/);
 assert.match(route,/originAllowed\(request\)/);
 assert.match(route,/product\.updated_at!==body\.productUpdatedAt/);
 assert.match(route,/changedAt!==body\.controlChangedAt/);
 assert.match(route,/requested!==body\.expectedRequested/);
 assert.match(route,/APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true"/);
 assert.match(route,/client\.rpc\("set_supplier_listing_intent"/);
 assert.match(route,/client\.rpc\("get_private_release_readiness"/);
 assert.match(route,/public:false/);
 assert.doesNotMatch(route,/\.update\(\{\s*is_published|\.update\(\{\s*is_public|service_role|SUPABASE_SECRET|createInvoice|modelProvider/);
});

test("UI routes signed-in suppliers to scoped chat and uses two visible confirmation clicks",()=>{
 const layout=read("src/app/layout.tsx");
 const ui=read("src/app/apex-assistant.tsx");
 const css=read("src/app/apex-assistant.css");
 assert.match(layout,/supplierCanManage=\{supplierCanManage\}/);
 assert.match(layout,/m\.role === "owner" \|\| m\.role === "manager"/);
 assert.match(ui,/supplierCanManage\?"\/api\/assistant\/supplier":"\/api\/assistant"/);
 assert.match(ui,/operation:"ask"/);
 assert.match(ui,/onClick=\{\(\)=>setPending\(\{item,action:item\.action!\}\)\}/);
 assert.match(ui,/Confirm request/);
 assert.match(ui,/operation:"confirm"/);
 assert.match(ui,/Powered by CoOperative Chat/);
 assert.match(css,/\.apex-assistant-form input\{[^}]*font-size:16px/);
});
