import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("mobile supplier bulk layout constrains saved-image dropdown to the viewport",()=>{
 const css=read("src/app/supplier/catalog/bulk/mobile-layout.css");
 const route=read("src/app/supplier/catalog/bulk/page.tsx");
 const image=read("src/app/supplier/catalog/shared-private-image-bulk-apply.tsx");
 assert.match(route,/import "\.\/mobile-layout\.css"/);
 assert.match(route,/className="container supplier-shell apex-bulk-page"/);
 assert.match(image,/className="apex-shared-image-controls"/);
 assert.match(image,/id="apex-shared-image-source"/);
 assert.match(css,/\.apex-bulk-page \.apex-shared-image-controls select\{/);
 assert.match(css,/width:100%;\s*min-width:0;\s*max-width:100%/);
 assert.match(css,/text-overflow:ellipsis/);
 assert.match(css,/\.apex-bulk-page \.apex-csv-panel\{/);
 assert.match(css,/\.apex-bulk-page \.apex-csv-downloads \.button\{/);
 assert.match(css,/\.apex-bulk-page\{[^}]*overflow-x:clip/s);
});
test("mobile bulk actions are in document flow and reachable without hiding inputs",()=>{
 const css=read("src/app/supplier/catalog/bulk/mobile-layout.css");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-footer\{\s*position:static;\s*bottom:auto;\s*z-index:auto;/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.apex-bulk-page \.apex-bulk-footer \.button\{[^}]*max-height:none;[^}]*white-space:normal/s);
 assert.match(editor,/href="#apex-bulk-actions"/);
 assert.match(editor,/id="apex-bulk-actions" aria-label="Bulk product actions"/);
 assert.match(editor,/Save selected/);
 assert.match(editor,/Preview all saved/);
 assert.match(editor,/Publish selected/);
 assert.match(editor,/Unpublish selected/);
 assert.match(editor,/Publish all eligible/);
 assert.doesNotMatch(css,/position:fixed|width:100vw/);
});
test("mobile fix changes presentation only, not customer publishing or checkout rules",()=>{
 const css=read("src/app/supplier/catalog/bulk/mobile-layout.css");
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(page,/get_private_release_readiness/);
 assert.match(editor,/saveBulkListingIntents/);
 assert.match(editor,/role="switch"/);
 assert.doesNotMatch(css,/\.apex-approved-|\.catalog-card|\.apex-customer/);
 assert.doesNotMatch(page+editor,/service_role|createInvoice|createOrderIntent|\.update\(\{is_published:\s*true/);
});
