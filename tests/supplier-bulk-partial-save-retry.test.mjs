import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bulkRowsRequiringSave,reconcileBulkSaveBatch,bulkSaveProgress}
 from "../src/lib/catalog/bulk-save-retry.mjs";
import {reconcileSavedBulkRow} from "../src/lib/catalog/bulk-save-revision.mjs";

const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const saved={key:"old",id:"existing-id",name:"Stored",sku:"SKU-1",needsSave:false};
const changed={key:"edit",id:"changed-id",name:"Updated",sku:"SKU-2",needsSave:true};
const imported={key:"new",name:"New",sku:"",needsSave:true};

test("successful saved selection remains available for preview but is excluded from retry",()=>{
 const selected=[saved,changed,imported];
 assert.deepEqual(bulkRowsRequiringSave(selected),[changed,imported]);
 assert.deepEqual(bulkRowsRequiringSave([saved],{old:{ok:false}}),[saved]);
 assert.deepEqual(bulkRowsRequiringSave([saved],{old:{ok:true}}),[]);
});

test("partial server batch only accepts unique and expected row outcomes",()=>{
 const submitted=[{key:"a"},{key:"b"},{key:"c"}];
 const batch=reconcileBulkSaveBatch(submitted,[
  {key:"a",ok:true,id:"id-a",message:"Saved"},
  {key:"a",ok:false,message:"Duplicate ignored"},
  {key:"b",ok:false,message:"Invalid price"},
  {key:"foreign",ok:true,id:"id-foreign",message:"Wrong row"},
  {key:42,ok:true,id:"wrong"},
 ]);
 assert.equal(batch.complete,false);
 assert.deepEqual(batch.results.map(r=>r.key),["a","b"]);
 const progress=bulkSaveProgress(submitted,batch.results,true);
 assert.deepEqual([progress.saved,progress.failed,progress.unfinished],[1,1,1]);
 assert.match(progress.message,/1 failed/);
 assert.match(progress.message,/1 not completed/);
 assert.match(progress.message,/will not be resubmitted/);
 assert.equal(progress.ok,false);
});

test("a mixed 45-row selection retries only failed and unattempted changes",()=>{
 const rows=Array.from({length:45},(_,i)=>({
  key:"card-"+i,id:i<35?"saved-"+i:undefined,sku:i<35?"SKU-"+i:"",
  name:"Sample "+i,needsSave:true,price:"25.00",
 }));
 const first=rows.slice(0,20).map((r,i)=>({
  key:r.key,ok:i!==4,id:i===4?undefined:"persisted-"+i,
  sku:r.sku||"GENERATED-"+i,message:i===4?"Invalid price":"Saved",
 }));
 const batch1=reconcileBulkSaveBatch(rows.slice(0,20),first);
 assert.equal(batch1.complete,true);
 const next=rows.slice(20,40).map((r,i)=>({
  key:r.key,ok:true,id:"persisted-"+(20+i),sku:r.sku||"GENERATED-"+(20+i),
  message:"Saved",
 }));
 const batch2=reconcileBulkSaveBatch(rows.slice(20,40),next);
 assert.equal(batch2.complete,true);
 const batch3=reconcileBulkSaveBatch(rows.slice(40),[]);
 assert.equal(batch3.complete,false);
 const all=[...batch1.results,...batch2.results,...batch3.results];
 const progress=bulkSaveProgress(rows,all,true);
 assert.deepEqual([progress.saved,progress.failed,progress.unfinished],[39,1,5]);
 const byKey=new Map(all.filter(r=>r.ok).map(r=>[r.key,r]));
 const updated=rows.map(r=>reconcileSavedBulkRow(r,r,byKey.get(r.key)));
 const retry=bulkRowsRequiringSave(updated,Object.fromEntries(all.map(r=>[r.key,{ok:r.ok}])));
 assert.deepEqual(retry.map(r=>r.key),["card-4","card-40","card-41","card-42","card-43","card-44"]);
 assert.equal(updated[39].needsSave,false);
 assert.equal(updated[39].id,"persisted-39");
 assert.equal(updated[40].needsSave,true);
 assert.equal(updated[40].id,undefined);
});

test("complete batch is truthful and no save is inferred from missing outcomes",()=>{
 const submitted=[{key:"x"},{key:"y"}];
 assert.equal(reconcileBulkSaveBatch(submitted,null).complete,false);
 assert.equal(reconcileBulkSaveBatch(submitted,[{key:"x",ok:true,id:"id-x"}]).complete,false);
 const complete=reconcileBulkSaveBatch(submitted,[
  {key:"x",ok:true,id:"id-x",message:"Saved"},
  {key:"y",ok:true,id:"id-y",message:"Saved"},
 ]);
 assert.equal(complete.complete,true);
 assert.deepEqual(bulkSaveProgress(submitted,complete.results,false),
  {ok:true,message:"2 of 2 changes saved.",saved:2,failed:0,unfinished:0});
});

test("client retry is bounded and never re-saves successfully confirmed cards",()=>{
 assert.match(editor,/const pendingSaveRows:BulkEditRow[]=bulkRowsRequiringSave\(selectedRows,lastSave\)/);
 assert.match(editor,/const pendingRows=pendingSaveRows\.slice\(\)/);
 assert.match(editor,/reconcileBulkSaveBatch\(pendingRows\.slice\(i,i\+20\),next\.results\)/);
 assert.match(editor,/if\(!batch\.complete\)\{stopped=true;break;\}/);
 assert.match(editor,/bulkSaveProgress\(pendingRows,all,stopped\)/);
 assert.match(editor,/reconcileSavedBulkRow/);
 assert.match(editor,/if\(progress\.saved>0\)router\.refresh\(\)/);
 assert.match(editor,/pendingSaveRows\.length<=250/);
 assert.match(editor,/const savedSelected=selectedRows\.filter/);
 assert.match(editor,/const previewSelected=selectedIds\.length/);
 assert.match(editor,/Save selected/);
 assert.match(editor,/Publish all eligible/);
 assert.doesNotMatch(editor,/service_role|createPublicUrl|is_published:true|is_public:true/);
});
