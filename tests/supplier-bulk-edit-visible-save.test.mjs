import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bulkViewAfterEdit,selectEditedBulkRow} from "../src/lib/catalog/bulk-edit-visibility.mjs";
import {filterSupplierBulkRows} from "../src/lib/catalog/bulk-workspace-filter.mjs";

const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const row={key:"product-one",id:"saved-one",name:"Sample One",sku:"TEST-100",needsSave:false};
const controls=[{productId:"saved-one",canRequest:true,requested:false}];

test("status-filtered row cannot disappear midway through edits",()=>{
 assert.equal(filterSupplierBulkRows([row],"","ready",controls).length,1);
 const changed={...row,description:"Updated",needsSave:true};
 assert.equal(filterSupplierBulkRows([changed],"","ready",controls).length,0);
 const view=bulkViewAfterEdit("","description");
 assert.deepEqual(view,{query:"",filter:"all"});
 assert.deepEqual(filterSupplierBulkRows([changed],view.query,view.filter,controls),[changed]);
});

test("editing title or SKU clears a stale text query so product remains visible",()=>{
 for(const field of ["name","sku"]){
  const view=bulkViewAfterEdit("TEST",field);
  assert.deepEqual(view,{query:"",filter:"all"});
  const changed={...row,name:"Renamed",sku:"OTHER-2",needsSave:true};
  assert.deepEqual(filterSupplierBulkRows([changed],view.query,view.filter,controls),[changed]);
 }
});

test("editing unrelated fields preserves text search and keeps filtered card selected",()=>{
 const view=bulkViewAfterEdit(" TEST ","price");
 assert.deepEqual(view,{query:" TEST ",filter:"all"});
 const changed={...row,price:"50.00",needsSave:true};
 assert.deepEqual(filterSupplierBulkRows([changed],view.query,view.filter,controls),[changed]);
 assert.deepEqual(selectEditedBulkRow([],row.key),[row.key]);
 assert.deepEqual(selectEditedBulkRow(["other"],row.key),["other",row.key]);
 assert.deepEqual(selectEditedBulkRow([row.key],row.key),[row.key]);
});

test("source wires edited-row selection, filter escape and existing save guards",()=>{
 assert.match(editor,/const nextView=bulkViewAfterEdit\(productSearch,field\)/);
 assert.match(editor,/if\(nextView\.filter!==viewFilter\)setViewFilter\(nextView\.filter\)/);
 assert.match(editor,/if\(nextView\.query!==productSearch\)setProductSearch\(nextView\.query\)/);
 assert.match(editor,/setSelected\(prev=>selectEditedBulkRow\(prev,key\)\)/);
 assert.match(editor,/needsSave:true/);
 assert.match(editor,/const selectedRows=visibleRows\.filter/);
 assert.match(editor,/disabled=\{!editable\|\|busy\|\|!selectedValid\}/);
 assert.doesNotMatch(editor,/service_role|createPublicUrl|is_published:true|is_public:true/);
});
