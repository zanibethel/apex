import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prioritizeImportedProducts} from "../src/lib/catalog/prioritize-imported-products.mjs";

const read=p=>readFileSync(p,"utf8");
const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
const css=read("src/app/globals.css");

test("CSV import surfaces new cards first instead of below existing 100 products",()=>{
 const initial=Array.from({length:100},(_,i)=>({key:"saved-"+i,name:"Saved "+i,id:"pid-"+i}));
 const imported=[{key:"new-one",name:"New 1"},{key:"new-two",name:"New 2"}];
 const next=prioritizeImportedProducts(initial,imported);
 assert.deepEqual(next.slice(0,2),imported);
 assert.equal(next.length,102);
 assert.deepEqual(next.slice(2),initial);
});

test("CSV updates move changed existing row first and do not duplicate it or erase other rows",()=>{
 const original=[{key:"old-1",name:"Saved"},{key:"old-2",name:"Other"}];
 const imported=[{key:"old-2",name:"Updated CSV",needsSave:true},{key:"new-one",name:"New"}];
 const next=prioritizeImportedProducts(original,imported);
 assert.deepEqual(next,[
  imported[0],imported[1],original[0],
 ]);
 assert.equal(new Set(next.map(x=>x.key)).size,next.length);
});

test("new imports are selected, tagged and described after upload",()=>{
 assert.match(editor,/prioritizeImportedProducts\(prev,imported\)/);
 assert.match(editor,/setRecentImportKeys\(imported\.map\(r=>r\.key\)\)/);
 assert.match(editor,/setSelected\(imported\.map\(r=>r\.key\)\)/);
 assert.match(editor,/recentImported\.has\(r\.key\)/);
 assert.match(editor,/FROM CSV/);
 assert.match(editor,/CSV product/);
 assert.match(editor,/role="status"/);
});

test("live offer preview appears before long edit form on mobile",()=>{
 assert.match(editor,/className=\{"apex-bulk-card-layout"/);
 assert.match(editor,/className="apex-bulk-editor-side"/);
 assert.match(editor,/showOfferTiles&&<BulkInlineOffer/);
 assert.match(css,/@media\(max-width:950px\)/);
 assert.match(css,/\.apex-bulk-card-layout:not\(\.apex-bulk-card-layout-single\) \.apex-bulk-inline-preview/);
 assert.match(css,/order:-1/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/max-width:100%/);
 assert.match(editor,/Hide live offer tiles/);
});

test("preview changes do not bypass draft-save or private publishing safeguards",()=>{
 assert.match(editor,/const savedSelected=selectedRows\.filter\(r=>Boolean\(r\.id\)&&!r\.needsSave\)/);
 assert.match(editor,/r\.id&&!r\.needsSave/);
 assert.match(editor,/saveBulkProductDrafts/);
 assert.doesNotMatch(editor,/createPublicUrl|service_role|is_published:true|is_public:true/);
});
