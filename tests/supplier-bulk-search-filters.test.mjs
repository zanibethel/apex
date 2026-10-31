
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterSupplierBulkRows,BULK_VIEW_FILTERS} from "../src/lib/catalog/bulk-workspace-filter.mjs";
const rows=[
 {key:"unsaved",name:"GetSwole Starter",sku:"",needsSave:true},
 {key:"edited",id:"2",name:"Draft changed",sku:"DS-22",needsSave:true},
 {key:"ready",id:"3",name:"Example Whey",sku:"WW-30",needsSave:false},
 {key:"held",id:"4",name:"Test Kit Alpha",sku:"TA-40",needsSave:false},
 {key:"requested",id:"5",name:"Control Sample",sku:"CS-50",needsSave:false},
 {key:"newrequest",id:"6",name:"Another test",sku:"AT-60",needsSave:false},
];
const listing=[
 {productId:"2",requested:false,canRequest:true,status:"Ready",missing:[]},
 {productId:"3",requested:false,canRequest:true,status:"Ready",missing:[]},
 {productId:"4",requested:false,canRequest:false,status:"On hold",missing:[]},
 {productId:"5",requested:true,canRequest:false,status:"Requested",missing:[]},
 {productId:"6",requested:false,canRequest:true,status:"Ready",missing:[]},
];
const keys=x=>x.map(r=>r.key);
const newRequests=new Set(["6"]);
const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const css=readFileSync("src/app/globals.css","utf8");

test("search matches title or SKU, ignores whitespace and case, and preserves order",()=>{
 assert.deepEqual(keys(filterSupplierBulkRows(rows," gEtSwoLe ","all",listing)),["unsaved"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows," ww-30 ","all",listing)),["ready"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows," TEST ","all",listing)),["held","newrequest"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows,"","all",listing)),keys(rows));
});
test("status views separate unsaved, ready, requested and held rows",()=>{
 assert.deepEqual(BULK_VIEW_FILTERS,["all","unsaved","ready","requested","needs_attention"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows,"","unsaved",listing,newRequests)),["unsaved","edited"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows,"","ready",listing,newRequests)),["ready"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows,"","requested",listing,newRequests)),["requested","newrequest"]);
 assert.deepEqual(keys(filterSupplierBulkRows(rows,"","needs_attention",listing,newRequests)),["held"]);
});
test("missing readiness is never ready; view filtering does not authorize publication",()=>{
 const entry={key:"x",id:"not-in-list",name:"Untested",sku:"X",needsSave:false};
 assert.deepEqual(filterSupplierBulkRows([entry],"","ready",listing),[]);
 assert.deepEqual(filterSupplierBulkRows([entry],"","needs_attention",listing),[entry]);
 assert.deepEqual(filterSupplierBulkRows([entry],"","unsupported-filter",listing),[entry]);
});
test("title/SKU search scales across imported cards without changing source",()=>{
 const big=Array.from({length:150},(_,i)=>({key:"k"+i,id:"p"+i,name:"Sample "+i,sku:"CAT-"+i,needsSave:i%2===0}));
 assert.deepEqual(keys(filterSupplierBulkRows(big,"cat-149","all",[])),["k149"]);
 assert.equal(filterSupplierBulkRows(big,"cat-149","unsaved",[]).length,0);
 assert.equal(big.length,150);
});
test("actions use only selected visible cards and changing view clears selection",()=>{
 assert.ok(editor.includes("const visibleRows=filterSupplierBulkRows(rows,productSearch,viewFilter,listing,newlyRequested)"));
 assert.ok(editor.includes("const selectedRows=visibleRows.filter(r=>selectedSet.has(r.key))"));
 assert.ok(editor.includes("setSelected(allVisibleSelected?[]:visibleRows.map(r=>r.key))"));
 assert.ok(editor.includes("setProductSearch(e.target.value);setSelected([])"));
 assert.ok(editor.includes("setViewFilter(e.target.value);setSelected([])"));
 assert.ok(editor.includes('setProductSearch("");setViewFilter("all")'));
 assert.ok(editor.includes("saveBulkPublicationRequests"));
});
test("search and filter remain accessible and fit mobile columns",()=>{
 assert.ok(editor.includes('id="apex-bulk-search"'));
 assert.ok(editor.includes('type="search"'));
 assert.ok(editor.includes('id="apex-bulk-status-filter"'));
 assert.ok(editor.includes("Showing {visibleRows.length} of {rows.length} products"));
 assert.ok(editor.includes("visibleRows.map((r,i)=>"));
 assert.ok(editor.includes("No products match this view"));
 assert.ok(css.includes(".apex-bulk-filterbar{display:grid"));
 assert.ok(css.includes(".apex-bulk-filterbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)"));
 assert.ok(!editor.includes("service_role"));
});
