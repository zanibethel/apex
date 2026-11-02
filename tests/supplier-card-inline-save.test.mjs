import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mergeBulkSaveRetryKeys} from "../src/lib/catalog/bulk-inline-save-retry.mjs";
import {reconcileSavedBulkRow} from "../src/lib/catalog/bulk-save-revision.mjs";
import {bulkUnfinishedSaveKeys,bulkSaveProgress} from "../src/lib/catalog/bulk-save-retry.mjs";
const read=path=>readFileSync(path,"utf8");
const base={key:"cardA",id:"00000000-0000-4000-8000-000000000001",
 name:"Synthetic private item",sku:"TEST-A",description:"Private editing test",
 price:"12.00",comparePrice:"",sourceCost:"",categoryId:"",isActive:false,
 linkedSource:false,needsSave:true};
const next={...base,key:"cardB",id:"00000000-0000-4000-8000-000000000002"};

test("single-card successful save preserves other selected failures",()=>{
 const previous=["cardB","cardC"];
 const got=mergeBulkSaveRetryKeys(previous,[base],[]);
 assert.deepEqual(got,["cardB","cardC"]);
 const saved=reconcileSavedBulkRow(base,base,{key:base.key,id:base.id,ok:true,sku:"TEST-A"});
 assert.equal(saved.needsSave,false);
 const unfinished=bulkUnfinishedSaveKeys([base],[{key:base.key,ok:true,id:base.id}]);
 assert.deepEqual(unfinished,[]);
});

test("single-card missing server result remains retriable without clearing other failures",()=>{
 const unfinished=bulkUnfinishedSaveKeys([base],[]);
 assert.deepEqual(unfinished,["cardA"]);
 assert.deepEqual(mergeBulkSaveRetryKeys(["cardB"],[base],unfinished),["cardB","cardA"]);
 assert.deepEqual(mergeBulkSaveRetryKeys(["cardA","cardB"],[base],unfinished),["cardB","cardA"]);
 assert.match(bulkSaveProgress([base],[],true).message,/not completed/);
});

test("single-card failed result is not treated as saved",()=>{
 const confirmed={key:base.key,ok:false,message:"Validation failed",id:base.id};
 assert.deepEqual(bulkUnfinishedSaveKeys([base],[confirmed]),["cardA"]);
 assert.deepEqual(mergeBulkSaveRetryKeys(["cardB"],[base],["cardA"]),["cardB","cardA"]);
 assert.equal(reconcileSavedBulkRow(base,base,confirmed).needsSave,true);
});

test("single save uses ONLY current card, even when other cards are selected",()=>{
 const ui=read("src/app/supplier/catalog/bulk-editor.tsx");
 const server=read("src/app/supplier/catalog/bulk-actions.ts");
 assert.match(ui,/function saveRows\(chosenRows:BulkEditRow\[\],mode:"selected"\|"single"\)/);
 assert.match(ui,/function saveSingle\(row:BulkEditRow\)/);
 assert.match(ui,/saveRows\(\[row\],"single"\)/);
 assert.match(ui,/saveRows\(pendingSaveRows,"selected"\)/);
 assert.match(ui,/const pendingRows=chosenRows\.slice\(\)/);
 assert.match(ui,/setSaveRetryKeys\(previous=>mergeBulkSaveRetryKeys\(previous,pendingRows,unfinished\)\)/);
 assert.match(ui,/if\(mode==="selected"\)/);
 assert.match(ui,/Save was not confirmed\. Retry this card\./);
 assert.match(ui,/onClick=\{\(\)=>saveSingle\(r\)\}/);
 assert.match(ui,/Save changes/);
 assert.match(ui,/Save selected/);
 assert.match(ui,/role="switch"/);
 assert.match(ui,/apex-bulk-card-pencil/);
 assert.match(server,/saveBulkProductDrafts/);
 assert.match(server,/verifiedStore\(storeId\)/);
 assert.match(server,/row\.id\?await updateDraftProduct/);
 assert.doesNotMatch(ui,/createPublicUrl|service_role|createInvoice|set_admin_listing_override/);
});

test("single-card save does not falsely clear later edits while response is in flight",()=>{
 const submitted={...base,name:"Previous submitted"};
 const current={...base,name:"Newer change"};
 const result=reconcileSavedBulkRow(current,submitted,{key:base.key,id:base.id,ok:true,sku:"TEST-A"});
 assert.equal(result.name,"Newer change");
 assert.equal(result.needsSave,true);
 assert.deepEqual(mergeBulkSaveRetryKeys(["cardB"],[base,next],["cardA"]),["cardA"]);
});
