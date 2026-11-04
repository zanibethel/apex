import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const page=read("src/app/supplier/catalog/bulk/page.tsx");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const css=read("src/app/supplier/catalog/bulk/mobile-layout.css");

test("supplier arrives at compact import tools with immediate product-card shortcut",()=>{
 assert.match(page,/className="apex-bulk-quick-nav" aria-label="Product manager shortcuts"/);
 assert.match(page,/href="#bulk-product-cards">View product cards/);
 assert.match(page,/href="#apex-source-tools">Source import/);
 assert.match(page,/href="#apex-image-tools">Shared images/);
 assert.match(page,/href="#apex-csv-tools">CSV import \/ export/);
 assert.ok(page.indexOf('className="apex-bulk-quick-nav"')<
  page.indexOf('<BulkDraftEditor'));
 assert.ok(page.indexOf('href="#bulk-product-cards"')<
  page.indexOf('<SharedPrivateImageBulkApply'));
 assert.match(page,/<BulkDraftEditor storeId=\{store.id\}/);
});

test("source and shared image actions stay intact behind native accessible expanders",()=>{
 assert.match(page,/<details className="apex-bulk-advanced" id="apex-source-tools">/);
 assert.match(page,/<details className="apex-bulk-advanced" id="apex-image-tools">/);
 assert.match(page,/sourceListUsable\?<SourceDraftImport storeId=\{store.id\}/);
 assert.match(page,/<SharedPrivateImageBulkApply storeId=\{store.id\}/);
 assert.doesNotMatch(page,/<details[^>]*\bopen\b/);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-advanced>summary\{/);
 assert.match(css,/min-height:48px;/);
});

test("CSV importer remains mounted and usable, not removed or automatically published",()=>{
 assert.match(editor,/<details className="apex-bulk-advanced" id="apex-csv-tools">/);
 assert.match(editor,/<CsvProductImport rows=\{rows\} categories=\{categories\} disabled=\{!editable\|\|busy\} onLoad=\{loadFromCsv\}\/>/);
 assert.ok(editor.indexOf('<CsvProductImport')<
  editor.indexOf('id="bulk-product-cards"'));
 assert.ok(editor.indexOf('id="bulk-product-cards"')<
  editor.indexOf('id="apex-bulk-actions"'));
 assert.match(editor,/href="#apex-bulk-actions"/);
 assert.match(editor,/id="apex-product-workspace"/);
 assert.match(editor,/role="switch"/);
 assert.match(editor,/Save selected/);
 assert.match(editor,/Publish selected/);
});

test("mobile advanced tool layout remains inside phone width and retains touch targets",()=>{
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-quick-nav\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-quick-nav \.button\{[^}]*min-width:0;[^}]*min-height:44px/s);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-advanced\{[^}]*min-width:0;[^}]*max-width:100%/s);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-advanced>summary>span\{/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/position:static/);
 assert.doesNotMatch(css,/width:100vw|position:fixed/);
});

test("advanced tools change presentation only; private permissions and public checkout intact",()=>{
 assert.match(page,/get_private_release_readiness/);
 assert.match(page,/createSupplierServerClient/);
 assert.match(editor,/saveBulkListingIntents/);
 assert.doesNotMatch(page+editor,/service_role|createPublicUrl|createInvoice|createOrderIntent|\.update\(\{is_published:\s*true/);
});
