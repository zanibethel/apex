import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync("src/app/supplier/catalog/bulk/mobile-layout.css","utf8");
const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const cardRule=(selector)=>{
 const start=css.indexOf(selector+"{");
 assert.ok(start>=0,"Missing layout rule: "+selector);
 return css.slice(start,css.indexOf("}",start)+1);
};

test("mobile product text gets a flexible, bounded column beside fixed actions",()=>{
 const row=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-bulk-row-title");
 assert.match(row,/display:grid/);
 assert.match(row,/grid-template-columns:64px minmax\(0,1fr\) max-content/);
 const label=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-bulk-row-title .apex-bulk-select");
 assert.match(label,/width:100%/);
 assert.match(label,/min-width:0/);
 assert.match(label,/white-space:normal/);
 const actions=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-bulk-card-top-actions");
 assert.match(actions,/min-width:max-content/);
 assert.match(actions,/justify-self:end/);
 assert.match(css,/@media\(max-width:700px\)\{[^}]*\.apex-bulk-page \.apex-bulk-workspace \.apex-bulk-row-title\{[^}]*grid-template-columns:52px minmax\(0,1fr\) max-content/s);
});
test("long product names wrap, price/category metadata clamps in its own area",()=>{
 const title=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-supplier-card-heading strong");
 assert.match(title,/white-space:normal/);
 assert.match(title,/overflow-wrap:anywhere/);
 const meta=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-supplier-card-heading small");
 assert.match(meta,/overflow:hidden/);
 assert.match(meta,/white-space:normal/);
 assert.match(meta,/-webkit-line-clamp:2/);
 const status=cardRule(".apex-bulk-page .apex-bulk-workspace .apex-bulk-card-status-row");
 assert.match(status,/grid-column:1 \/ -1/);
});
test("mobile fixes preserve functional editing and supplier publication controls",()=>{
 assert.match(editor,/className="apex-supplier-card-heading"/);
 assert.match(editor,/className="apex-bulk-card-pencil"/);
 assert.match(editor,/className="apex-bulk-card-publish-switch"/);
 assert.match(editor,/className="apex-bulk-card-status-row"/);
 assert.match(editor,/Save changes/);
 assert.match(editor,/role="switch"/);
 const cssRules=css.slice(css.indexOf("/* Mobile supplier cards: reserve"));
 assert.doesNotMatch(cssRules,/pointer-events:none|display:none|position:absolute|z-index/);
});
