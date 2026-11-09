import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {answerSupplierCatalogMessage,supplierCatalogIntent} from "../src/lib/chat/supplier-catalog.mjs";
const read=path=>readFileSync(path,"utf8");

test("supplier chat starts product creation without any upstream AI or BTCPay action",()=>{
 for(const query of ["add product","create a new product","I want to add a product","create listing"]){
  assert.equal(supplierCatalogIntent(query),"create",query);
  const reply=answerSupplierCatalogMessage(query,[]);
  assert.equal(reply.items.length,0);
  assert.equal(reply.link,"/supplier/catalog/bulk?new=1#apex-product-workspace");
  assert.match(reply.answer,/BTCPay setup is not required/i);
 }
 assert.equal(supplierCatalogIntent("publish Sample One"),"publish");
 assert.equal(supplierCatalogIntent("unpublish Sample Two"),"unpublish");
});

test("supplier direct creation opens unsaved draft, not existing product modification",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 const home=read("src/app/supplier/page.tsx");
 const showroom=read("src/app/supplier/catalog/storefront-test/supplier-showroom.tsx");
 const assistant=read("src/app/apex-assistant.tsx");
 assert.match(page,/initialNewProduct=params\.new==="1"/);
 assert.match(page,/initialNewProduct=\{initialNewProduct\}/);
 assert.match(editor,/initialNewProduct&&editable/);
 assert.match(editor,/quick-add-new-product/);
 assert.match(editor,/needsSave:true/);
 assert.match(editor,/isActive:true,needsSave:true/);
 assert.match(editor,/initialNewProduct&&editable\?"unsaved":"all"/);
 assert.match(home,/Add product/);
 assert.match(home,/memberships\.some\(m=>m\.role==="owner"\|\|m\.role==="manager"\)/);
 assert.match(showroom,/Add product to supplier catalog/);
 assert.match(assistant,/\/supplier\/catalog\/bulk\?new=1#apex-product-workspace/);
 assert.match(assistant,/Add a product/);
});

test("existing supplier writes are scoped to verified owner-manager and independent of BTCPay",()=>{
 const actions=read("src/app/supplier/catalog/bulk-actions.ts");
 const create=read("src/app/supplier/operations/actions.ts");
 const showroom=read("src/app/supplier/catalog/storefront-test/page.tsx");
 assert.match(actions,/client\.auth\.getUser\(\)/);
 assert.match(actions,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(create,/export async function createDraftProduct/);
 assert.match(create,/\.insert\(\{store_id:store\.storeId/);
 assert.match(create,/is_active:form\.get\("isActive"\)==="on"/);
 assert.match(create,/quantity_on_hand:0/);
 assert.match(showroom,/\.eq\("store_id",store\.id\)/);
 assert.doesNotMatch(actions+create,/createInvoice|createPayment|btcpay\/greenfield|sendBitcoin|walletAddress/i);
});
