import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

const css=read("src/app/globals.css");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const offer=read("src/components/catalog/offer-tile.tsx");

const lastCompact=css.slice(css.lastIndexOf("/* Compact supplier workspace only."));
test("supplier cards are compact and open editors span the two-column desktop layout",()=>{
 assert.ok(lastCompact.includes(".apex-bulk-workspace .apex-bulk-row{"));
 assert.match(lastCompact,/padding:11px/);
 assert.match(lastCompact,/@media\(min-width:1120px\)/);
 assert.match(lastCompact,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(lastCompact,/\.apex-bulk-row-editing\{grid-column:1 \/ -1\}/);
 assert.match(editor,/editOpenKeys\.includes\(r\.key\)\|\|!r\.id/);
 assert.match(editor,/apex-bulk-row-editing/);
});
test("image is genuinely zoomed out instead of cropped, including on phones",()=>{
 assert.match(lastCompact,/\.apex-bulk-inline-preview \.apex-offer-image\{\s*aspect-ratio:auto;\s*height:136px;\s*max-height:136px/);
 assert.match(lastCompact,/\.apex-bulk-inline-preview \.apex-offer-image img\{[^}]*max-width:70%;[^}]*max-height:82%;[^}]*object-fit:contain/s);
 assert.match(lastCompact,/@media\(max-width:600px\)/);
 assert.match(lastCompact,/height:124px;max-height:124px/);
 assert.match(lastCompact,/max-width:65%;max-height:82%/);
 assert.match(offer,/objectFit:"contain"/);
 assert.doesNotMatch(lastCompact,/object-fit:cover|transform:scale\(/);
});
test("scope remains private catalog, with customer cards and storage untouched",()=>{
 const adjusted=lastCompact.split("\n").filter(line=>line.trim().startsWith(".")||line.trim().startsWith("@media"));
 assert.ok(adjusted.every(line=>line.includes(".apex-bulk-workspace")||
  line.startsWith("@media")||line.includes(".apex-bulk-workspace ")));
 assert.doesNotMatch(editor,/service_role|createPublicUrl|\.update\(\{is_published/);
 assert.match(editor,/apex-bulk-card-pencil/);
 assert.match(editor,/role="switch"/);
 assert.match(editor,/Save selected/);
 assert.match(editor,/BulkCardMedia/);
});
test("touch controls remain practical and editing UI stays accessible",()=>{
 assert.match(lastCompact,/\.apex-bulk-card-pencil\{min-width:40px;min-height:40px\}/);
 assert.match(lastCompact,/\.apex-bulk-preview-link\{min-height:44px\}/);
 assert.match(editor,/aria-label=\{"Edit "/);
 assert.match(editor,/aria-label=\{"Publish "/);
 assert.match(editor,/aria-expanded=\{editOpenKeys\.includes\(r\.key\)\|\|!r\.id\}/);
 assert.match(editor,/statusDetails|Status details/);
});
