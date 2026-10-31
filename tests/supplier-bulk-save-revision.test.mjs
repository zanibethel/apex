import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileSavedBulkRow} from "../src/lib/catalog/bulk-save-revision.mjs";

const original={
 key:"row-1",name:"Sample product",sku:"TEST-1",description:"Private sample",
 price:"20.00",comparePrice:"",sourceCost:"5.00",categoryId:"cat-1",
 isActive:true,linkedSource:false,needsSave:true,
};
const ok={key:"row-1",ok:true,id:"saved-uuid",sku:"TEST-1"};
const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const css=readFileSync("src/app/globals.css","utf8");

test("unchanged submitted draft becomes saved and retains its persisted ID",()=>{
 const result=reconcileSavedBulkRow({...original},{...original},ok);
 assert.equal(result.needsSave,false);
 assert.equal(result.id,"saved-uuid");
 assert.equal(result.sku,"TEST-1");
});
test("edits while the save is in flight remain unsaved after server success",()=>{
 const typed={...original,price:"24.00",description:"Changed before response"};
 const result=reconcileSavedBulkRow(typed,{...original},ok);
 assert.equal(result.needsSave,true);
 assert.equal(result.price,"24.00");
 assert.equal(result.description,"Changed before response");
 assert.equal(result.id,"saved-uuid");
});
test("new draft receives server-generated SKU even when later price edit needs another save",()=>{
 const submitted={...original,sku:""};
 const edited={...submitted,price:"23.00"};
 const result=reconcileSavedBulkRow(edited,submitted,{...ok,sku:"APX-SAMPLE-UUID"});
 assert.equal(result.sku,"APX-SAMPLE-UUID");
 assert.equal(result.needsSave,true);
});
test("explicit SKU edits while saving remain local, not overwritten",()=>{
 const typed={...original,sku:"CUSTOM-2"};
 const result=reconcileSavedBulkRow(typed,{...original},ok);
 assert.equal(result.sku,"CUSTOM-2");
 assert.equal(result.needsSave,true);
});
test("failed or unrelated save responses do not change the current card",()=>{
 assert.deepEqual(reconcileSavedBulkRow(original,original,{...ok,ok:false}),original);
 assert.deepEqual(reconcileSavedBulkRow(original,undefined,ok),original);
 assert.deepEqual(reconcileSavedBulkRow(original,original,undefined),original);
});
test("bulk editor blocks concurrent writes and reconciles against the submitted snapshot",()=>{
 assert.match(editor,/submittedByKey=new Map\(pendingRows\.map\(r=>\[r\.key,r\]\)\)/);
 assert.match(editor,/reconcileSavedBulkRow\(r,/);
 assert.match(editor,/const busy=pending\|\|publishPending/);
 assert.match(editor,/if\(!editable\|\|busy\)return/);
 assert.match(editor,/disabled=\{!editable\|\|busy\}/);
 assert.match(editor,/disabled=\{busy\} checked=\{selectedSet\.has\(r\.key\)\}/);
 assert.match(editor,/enabled=\{editable&&!busy\}/);
 assert.match(editor,/Previous version saved · newer edits unsaved/);
});

test("mobile footer uses compact two-column controls instead of full-width stacked actions",()=>{
 assert.match(css,/@media\(max-width:600px\)\{[\s\S]*?\.apex-bulk-footer\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.apex-bulk-footer \.button\{[\s\S]*?min-height:44px;max-height:48px/);
 assert.match(css,/\.apex-bulk-action-short\{display:inline\}/);
 assert.match(css,/\.apex-bulk-footer \.button:disabled\{opacity:\.43/);
 assert.match(editor,/className="apex-bulk-action-short"/);
 assert.match(editor,/aria-label="Preview all saved"/);
 assert.doesNotMatch(editor,/Select saved products to preview together\./);
 assert.match(editor,/Publish all eligible/);
 assert.match(editor,/Publish selected/);
 assert.match(editor,/saveBulkPublicationRequests/);
});
