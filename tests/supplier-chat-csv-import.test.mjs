import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierCatalogIntent,answerSupplierCatalogMessage} from "../src/lib/chat/supplier-catalog.mjs";
import {validateSupplierChatCsv,planSupplierChatCsv,SUPPLIER_CHAT_CSV_BATCH_SIZE} from "../src/lib/chat/supplier-csv.mjs";

const read=p=>readFileSync(p,"utf8");
const CATEGORIES=[{id:"01234567-1234-4123-8123-123456789abc",name:"Sample Apparel"}];
const CSV_HEADER="product_id,sku,title,description,source_cost,price,compare_at_price,category,active\r\n";
const file=(...rows)=>CSV_HEADER+rows.join("\r\n")+"\r\n";
const first=",TEE-001,Sample Cotton Shirt,Generic garment,5.00,19.99,,Sample Apparel,true";
const second=",CAP-001,Sample Cap,Generic cap,,14.99,,Sample Apparel,true";

test("supplier requests can download CSV or open upload without an AI call",()=>{
 for(const q of ["CSV template","download product csv template","send me a spreadsheet template"]){
  assert.equal(supplierCatalogIntent(q),"csv_template",q);
  const response=answerSupplierCatalogMessage(q,[]);
  assert.equal(response.tool,"csv_template");
  assert.match(response.answer,/Download/i);
 }
 for(const q of ["upload csv","import products","bulk upload","import CSV file"]){
  assert.equal(supplierCatalogIntent(q),"csv_import",q);
  assert.equal(answerSupplierCatalogMessage(q,[]).tool,"csv_import");
 }
 assert.equal(supplierCatalogIntent("publish Sample Cotton Shirt"),"publish");
 assert.equal(supplierCatalogIntent("add a product"),"create");
});

test("chat CSV keeps the existing 9-column template, validates normal retail rows and categories",()=>{
 const checked=validateSupplierChatCsv(file(first,second),CATEGORIES);
 assert.equal(checked.ok,true);
 assert.equal(checked.rows.length,2);
 assert.equal(checked.rows[0].sku,"TEE-001");
 assert.equal(checked.rows[0].categoryId,CATEGORIES[0].id);
 assert.equal(checked.rows[1].isActive,true);
 assert.equal(SUPPLIER_CHAT_CSV_BATCH_SIZE,20);
});

test("CSV rejects updates, duplicate SKU, unknown categories, missing SKU and formulas",()=>{
 const cases=[
  file(",TEE-001,Sample Shirt,Generic,,10.00,,Unknown category,true"),
  file(",TEE-001,Sample Shirt,Generic,,10.00,,Sample Apparel,true",
       ",TEE-001,Second product,Generic,,9.00,,Sample Apparel,true"),
  file(", ,Missing SKU,Generic,,10.00,,Sample Apparel,true"),
  file("12345678-1234-4123-8123-123456789abc,TEE-001,Update attempt,Generic,,10.00,,Sample Apparel,true"),
  file(",F-001,=HYPERLINK(A1),Generic,,10.00,,Sample Apparel,true"),
 ];
 for(const data of cases){
  const result=validateSupplierChatCsv(data,CATEGORIES);
  assert.equal(result.ok,false);
  assert.equal(result.rows.length,0);
  assert.ok(result.errors.length>0);
 }
});
test("repeat uploads skip identical SKU and never overwrite changed items",()=>{
 const rows=validateSupplierChatCsv(file(first,second),CATEGORIES).rows;
 const plan=planSupplierChatCsv(rows,[{sku:"tee-001",name:"Sample Cotton Shirt",price_cents:1999}]);
 assert.equal(plan.creates.length,1);
 assert.equal(plan.creates[0].sku,"CAP-001");
 assert.equal(plan.skipped.length,1);
 assert.equal(plan.conflicts.length,0);
 const changed=planSupplierChatCsv(rows,[{sku:"TEE-001",name:"Different Product",price_cents:1999}]);
 assert.equal(changed.conflicts.length,1);
 assert.equal(changed.creates.length,1);
});

test("CSV route validates authenticated store, limits, file bytes and explicit same-origin import confirmation",()=>{
 const route=read("src/app/api/assistant/supplier/csv/route.ts");
 const ui=read("src/app/supplier/catalog/chat-csv-tools.tsx");
 const chat=read("src/app/apex-assistant.tsx");
 const css=read("src/app/apex-assistant.css");
 assert.match(route,/createSupplierServerClient/);
 assert.match(route,/client\.auth\.getUser\(\)/);
 assert.match(route,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(route,/\.eq\("is_public",false\)/);
 assert.match(route,/stores\?\.length!==1/);
 assert.match(route,/sameOrigin\(request\)/);
 assert.match(route,/new TextEncoder\(\)\.encode\(params\.csvText\)\.length>256000/);
 assert.match(route,/categoryCount!==categories\?\.length\|\|productCount!==products\?\.length/);
 assert.match(route,/\.is\("archived_at",null\)/);
 assert.match(route,/plan\.conflicts\.length/);
 assert.match(route,/if\(params\.operation==="preview"\)/);
 assert.match(route,/saveBulkProductDrafts/);
 assert.match(route,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(route,/public:false/);
 assert.doesNotMatch(route,/service_role|SUPABASE_SECRET|createInvoice|is_published:true|BTCPay/i);
 assert.match(ui,/\/templates\/apex-product-import-template\.csv/);
 assert.match(ui,/type="file" accept="\.csv,text\/csv"/);
 assert.match(ui,/parseProductCsv\(text\)/);
 assert.match(ui,/request\("preview",text\)/);
 assert.match(ui,/request\("import",csvText,offset\)/);
 assert.match(ui,/Confirm import of/);
 assert.match(ui,/Re-upload the same file to retry without duplicating saved SKUs/);
 assert.match(chat,/SupplierChatCsvTools/);
 assert.match(chat,/tool\?:"csv_template"\|"csv_import"/);
 assert.match(css,/\.apex-assistant-csv-picker input\{width:100%;min-width:0;font-size:16px/);
});
