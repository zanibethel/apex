import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bulkUnfinishedSaveKeys,bulkSaveProgress,reconcileBulkSaveBatch}
 from "../src/lib/catalog/bulk-save-retry.mjs";
import {filterSupplierBulkRows} from "../src/lib/catalog/bulk-workspace-filter.mjs";

const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const rows=Array.from({length:45},(_,i)=>({
 key:"row-"+i,id:i<35?"existing-"+i:undefined,
 name:"Sample "+i,sku:i<35?"SKU-"+i:"",needsSave:true,
}));
const results=rows.slice(0,40).map((r,i)=>({
 key:r.key,ok:i!==4,id:i===4?undefined:"persisted-"+i,
 message:i===4?"Please check amount":"Saved",
}));

test("after 45-row partial save only failed and unattempted cards appear",()=>{
 const latest=reconcileBulkSaveBatch(rows.slice(0,20),results.slice(0,20));
 const second=reconcileBulkSaveBatch(rows.slice(20,40),results.slice(20,40));
 assert.equal(latest.complete,true);
 assert.equal(second.complete,true);
 const retry=bulkUnfinishedSaveKeys(rows,[...latest.results,...second.results]);
 assert.deepEqual(retry,["row-4","row-40","row-41","row-42","row-43","row-44"]);
 const shown=filterSupplierBulkRows(rows,"","save_retries",[],new Set(),new Set(retry));
 assert.deepEqual(shown.map(x=>x.key),retry);
 assert.equal(bulkSaveProgress(rows,results,true).saved,39);
});

test("unconfirmed successes and wholly missing responses stay visible for retry",()=>{
 const input=[{key:"1"},{key:"2"},{key:"3"},{key:"4"}];
 const outcomes=[
  {key:"1",ok:true,id:"persisted-1"},
  {key:"2",ok:true,id:""},
  {key:"3",ok:false,message:"Failed"},
 ];
 assert.deepEqual(bulkUnfinishedSaveKeys(input,outcomes),["2","3","4"]);
 assert.deepEqual(bulkUnfinishedSaveKeys(input,[]),["1","2","3","4"]);
 assert.deepEqual(bulkUnfinishedSaveKeys(input,[
  {key:"1",ok:true,id:"persisted-1"},
  {key:"2",ok:true,id:"persisted-2"},
  {key:"3",ok:true,id:"persisted-3"},
  {key:"4",ok:true,id:"persisted-4"},
 ]),[]);
});

test("failed-save view never broadens to unrelated selected or other store cards",()=>{
 const unrelated={key:"unrelated",name:"Foreign sample",sku:"Q",id:"foreign",needsSave:false};
 const retry=new Set(["row-4"]);
 assert.deepEqual(filterSupplierBulkRows([unrelated,...rows],"","save_retries",[],new Set(),retry).map(r=>r.key),["row-4"]);
 assert.deepEqual(filterSupplierBulkRows(rows,"Sample 4","save_retries",[],new Set(),retry).map(r=>r.key),["row-4"]);
 assert.deepEqual(filterSupplierBulkRows(rows,"Sample 25","save_retries",[],new Set(),retry),[]);
 assert.deepEqual(filterSupplierBulkRows(rows,"","save_retries",[],new Set()),[]);
});

test("UI switches to retry list only after a partial batch; preserves saved selection",()=>{
 assert.match(editor,/const unfinished=bulkUnfinishedSaveKeys\(pendingRows,all\)/);
 assert.match(editor,/setSaveRetryKeys\(unfinished\)/);
 assert.ok(editor.includes('if(unfinished.length){setProductSearch("");setViewFilter("save_retries");}'));
 assert.match(editor,/setViewFilter\("save_retries"\)/);
 assert.match(editor,/else if\(viewFilter==="save_retries"\)setViewFilter\("all"\)/);
 assert.match(editor,/Fix \/ retry saves/);
 assert.match(editor,/Show unfinished/);
 assert.match(editor,/Jump to product cards/);
 assert.match(editor,/const selectedRows=visibleRows\.filter/);
 assert.match(editor,/const previewSelected=selectedIds\.length/);
 assert.match(editor,/setSaveRetryKeys\(\[\]\)/);
 assert.doesNotMatch(editor,/createPublicUrl|service_role|is_published:true|is_public:true/);
});
