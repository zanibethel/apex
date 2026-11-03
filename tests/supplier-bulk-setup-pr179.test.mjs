import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stageSelectedBulkSetup} from "../src/lib/catalog/bulk-setup-batch.mjs";

const categoryId="63000000-0000-0000-0000-000000000001";
const otherCategory="63000000-0000-0000-0000-000000000002";
const row=(key,category="",isActive=false)=>({
 key,id:"64000000-0000-0000-0000-00000000000"+key,
 name:"Sample "+key,sku:"SKU-"+key,description:"Preserve existing details",
 price:"40.00",comparePrice:"80.00",sourceCost:"20.00",
 categoryId:category,isActive,linkedSource:true,needsSave:false,
});
test("fill missing category on selected cards only, without overwriting an existing category",()=>{
 const original=[row("1"),row("2",otherCategory),row("3")];
 const snapshot=structuredClone(original);
 const result=stageSelectedBulkSetup(original,["1","2"],
  {kind:"fill-missing-category",categoryId},[categoryId,otherCategory]);
 assert.equal(result.ok,true);
 assert.equal(result.selected,2);
 assert.deepEqual(result.changedKeys,["1"]);
 assert.equal(result.rows[0].categoryId,categoryId);
 assert.equal(result.rows[0].needsSave,true);
 assert.strictEqual(result.rows[1],original[1]);
 assert.strictEqual(result.rows[2],original[2]);
 assert.deepEqual(original,snapshot,"Input rows must never be mutated");
 for(const k of ["name","sku","description","price","comparePrice",
  "sourceCost","linkedSource","isActive","id"])
  assert.equal(result.rows[0][k],original[0][k],k);
});
test("mark selected active remains an unsaved local edit and cannot publish anything",()=>{
 const rows=[row("1"),row("2",otherCategory,true),row("3")];
 const result=stageSelectedBulkSetup(rows,["1","2"],
  {kind:"mark-active"},[categoryId]);
 assert.equal(result.ok,true);
 assert.deepEqual(result.changedKeys,["1"]);
 assert.equal(result.rows[0].isActive,true);
 assert.equal(result.rows[0].needsSave,true);
 assert.equal(result.rows[0].categoryId,"");
 assert.strictEqual(result.rows[1],rows[1]);
 assert.strictEqual(result.rows[2],rows[2]);
 assert.equal("is_published" in result.rows[0],false);
 assert.equal("supplier_wants_listing" in result.rows[0],false);
});
test("invalid/unknown category and stale selections fail closed without changes",()=>{
 const rows=[row("1"),row("2")];
 for(const [keys,change,cats] of [
  [["1"],{kind:"fill-missing-category",categoryId:otherCategory},[categoryId]],
  [["unknown"],{kind:"mark-active"},[categoryId]],
  [["1","1"],{kind:"mark-active"},[categoryId]],
  [["1"],{kind:"publish"},[categoryId]],
  [[],{kind:"mark-active"},[categoryId]],
 ]){
  const result=stageSelectedBulkSetup(rows,keys,change,cats);
  assert.equal(result.ok,false);
  assert.strictEqual(result.rows,rows);
  assert.deepEqual(result.changedKeys,[]);
 }
});
test("existing unsaved edits are preserved when a batch setup change is staged",()=>{
 const original={...row("1"),name:"Edited title",needsSave:true};
 const result=stageSelectedBulkSetup([original],["1"],
  {kind:"fill-missing-category",categoryId},[categoryId]);
 assert.equal(result.rows[0].name,"Edited title");
 assert.equal(result.rows[0].needsSave,true);
 assert.equal(original.categoryId,"");
});
test("UI requires explicit selection, local staging, and existing authenticated Save selected",()=>{
 const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
 const actions=readFileSync("src/app/supplier/catalog/bulk-actions.ts","utf8");
 const board=readFileSync("src/app/admin/catalog-release/page.tsx","utf8");
 assert.match(editor,/stageSelectedBulkSetup\(rows,selectedRows\.map/);
 assert.match(editor,/setSelected\(staged\.changedKeys\)/);
 assert.ok(editor.includes('setViewFilter("all")'));
 assert.match(editor,/Save selected/);
 assert.match(editor,/Fill missing category/);
 assert.match(editor,/Mark selected active/);
 assert.match(editor,/categories\.map\(category=>category\.id\)/);
 assert.match(editor,/No products? match|Bulk product creation and editing/);
 assert.match(actions,/async function verifiedStore/);
 assert.match(actions,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(actions,/Only a signed-in supplier owner or manager can edit this private store/);
 assert.match(actions,/saveBulkProductDrafts/);
 assert.match(board,/Needs category/);
 assert.match(board,/Inactive products/);
 assert.match(board,/Finish product setup in bulk/);
 assert.doesNotMatch(editor,/\.from\("products"\)\.update|service_role/);
});
