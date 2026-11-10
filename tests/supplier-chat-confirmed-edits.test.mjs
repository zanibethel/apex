import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSupplierEdit,proposeSupplierEdit} from "../src/lib/chat/supplier-edit.mjs";
import {answerSupplierCatalogMessage} from "../src/lib/chat/supplier-catalog.mjs";

const read=path=>readFileSync(path,"utf8");
const rows=[
 {id:"11111111-1111-4111-8111-111111111111",name:"Demo Cotton T-Shirt",sku:"DEMO-TEE-001",
  priceCents:2499,compareAtCents:null,stockOnHand:0,stockReserved:0,
  currency:"USD",active:true,requested:false,held:false,published:false,
  productUpdatedAt:"2026-11-09T20:00:00.000Z",controlChangedAt:null},
 {id:"22222222-2222-4222-8222-222222222222",name:"Demo Baseball Cap",sku:"DEMO-CAP-001",
  priceCents:1799,compareAtCents:2999,stockOnHand:3,stockReserved:1,
  currency:"USD",active:true,requested:false,held:false,published:false,
  productUpdatedAt:"2026-11-09T20:00:00.000Z",controlChangedAt:null},
];

test("single-product edits are parsed deterministically and never invent on-hand counts",()=>{
 assert.deepEqual(parseSupplierEdit("set price of Demo Cotton T-Shirt to $29.99"),{kind:"price",target:2999});
 assert.deepEqual(parseSupplierEdit("change stock of DEMO-TEE-001 to 10"),{kind:"stock",target:10});
 assert.deepEqual(parseSupplierEdit("mark Demo Cotton T-Shirt out of stock"),{kind:"stock",target:0});
 assert.equal(parseSupplierEdit("mark Demo Cotton T-Shirt in stock").kind,"invalid");
 assert.equal(parseSupplierEdit("set stock to 10.5").kind,"invalid");
 assert.equal(parseSupplierEdit("set price to 12.345").kind,"invalid");
 assert.equal(parseSupplierEdit("set price to 0").kind,"invalid");
 assert.equal(parseSupplierEdit("set price to 10000000").kind,"invalid");
 assert.equal(parseSupplierEdit("set stock to 1000001").kind,"invalid");
 assert.equal(parseSupplierEdit("set stock to -5").kind,"invalid");
 assert.equal(parseSupplierEdit("change price to 24 and stock to 5").kind,"multiple");
 assert.equal(parseSupplierEdit("where are my products"),null);
});

test("chat returns a single confirmable price or stock action and preserves the old state",()=>{
 const price=answerSupplierCatalogMessage("set price of Demo Cotton T-Shirt to $29.99",rows);
 assert.equal(price.items.length,1);
 assert.equal(price.items[0].action,"edit_price");
 assert.equal(price.items[0].editTarget,2999);
 assert.equal(price.items[0].editExpected,2499);
 assert.match(price.answer,/\$24\.99 → \$29\.99/);
 assert.match(price.answer,/does not publish/);
 const stock=answerSupplierCatalogMessage("change stock of DEMO-TEE-001 to 10",rows);
 assert.equal(stock.items.length,1);
 assert.equal(stock.items[0].action,"edit_stock");
 assert.equal(stock.items[0].editTarget,10);
 assert.equal(stock.items[0].editExpected,0);
 assert.equal(stock.items[0].productUpdatedAt,"2026-11-09T20:00:00.000Z");
});

test("ambiguous or unsafe private edits are not actionable",()=>{
 assert.equal(proposeSupplierEdit("change price of Demo Cotton T-Shirt to $24.99",rows).items.length,0);
 assert.equal(proposeSupplierEdit("set price of Demo Baseball Cap to $30.00",rows).items.length,0);
 assert.equal(proposeSupplierEdit("set stock of Demo Baseball Cap to 0",rows).items.length,0);
 assert.equal(proposeSupplierEdit("set price to $10.00",rows).items.length,0);
 assert.equal(proposeSupplierEdit("set stock of Missing Product to 8",rows).items.length,0);
 assert.equal(proposeSupplierEdit("set stock of Demo Cotton T-Shirt to 8",rows.concat([
  {...rows[0],id:"33333333-3333-4333-8333-333333333333"}
 ])).items.length,0);
 const published=rows.map((p,i)=>i===0?{...p,published:true}:p);
 assert.equal(proposeSupplierEdit("set price of Demo Cotton T-Shirt to $19.99",published).items.length,0);
 assert.equal(answerSupplierCatalogMessage("how much to inject",rows).items.length,0);
 assert.doesNotMatch(read("src/lib/chat/supplier-edit.mjs"),/fetch\(|\.update\(|\.rpc\(|SUPABASE_SECRET|service_role|createInvoice/);
});

test("new edits use existing supplier-scoped CAS, independent of public listing/payment controls",()=>{
 const api=read("src/app/api/assistant/supplier/route.ts");
 const ui=read("src/app/apex-assistant.tsx");
 assert.match(api,/client\.auth\.getUser\(\)/);
 assert.match(api,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(api,/\.eq\("is_public",false\)/);
 assert.match(api,/stores\?\.length!==1/);
 assert.match(api,/originAllowed\(request\)/);
 assert.match(api,/operation==="confirm_edit"/);
 assert.match(api,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(api,/\.is\("archived_at",null\)/);
 assert.match(api,/\.eq\("is_published",false\)/);
 assert.match(api,/product\.updated_at!==edit\.expectedProductUpdatedAt/);
 assert.match(api,/\.eq\("updated_at",edit\.expectedProductUpdatedAt\)\.eq\("price_cents",edit\.expectedValue\)/);
 assert.match(api,/\.eq\("quantity_on_hand",edit\.expectedValue\)/);
 assert.match(api,/\.lte\("quantity_reserved",edit\.targetValue\)/);
 assert.match(api,/if\(edit\.targetValue<inventory\.quantity_reserved\)/);
 assert.match(api,/public:false/);
 assert.doesNotMatch(api,/service_role|SUPABASE_SECRET|createInvoice|\.update\(\{is_published:true\}\)/);
 assert.match(ui,/edit_price/);
 assert.match(ui,/edit_stock/);
 assert.match(ui,/operation:"confirm_edit"/);
 assert.match(ui,/Confirm price change/);
 assert.match(ui,/Confirm stock change/);
 assert.match(ui,/This does not publish it or enable payments/);
});
