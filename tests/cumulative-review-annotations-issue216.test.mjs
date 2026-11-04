import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 parseAnnotationSnapshot,mergeAnnotationSnapshot,parseAnnotationReceipt,
} from "../src/lib/supplier/review-annotation-schema.mjs";
import {
 buildCumulativeReviewWorkbook,serializeCumulativeReviewCsv,
 previewCumulativeReviewImport,buildReviewAnnotationUploadChanges,
} from "../src/lib/supplier/cumulative-fulfillment-review-csv.mjs";
import {parseCsvCells} from "../src/lib/supplier/sales-reconciliation-csv.mjs";
const store="62000000-0000-0000-0000-000000000001";
const oid="66000216-0000-4000-8000-000000000001";
const pid="71000216-0000-4000-8000-000000000001";
const source={id:oid,storeId:store,reference:"SYNTH-ANNOTATION",
 purchasedAt:"2026-11-03T20:00:00.000Z",readiness:"held",
 purchasedUnits:2,plannedUnits:1,unplannedUnits:1,
 lines:[{number:1,sku:"SKU-TEST",title:"Synthetic item",
  variant:"",purchased:2,planned:1,unplanned:1}],
 plans:[{id:pid,reference:"SYNTH-PLAN",revision:1,status:"review_only",
  plannedUnits:1,drafts:[],canShip:false,canBuyLabel:false}],
 canShip:false,canBuyLabel:false,canEnterTracking:false,
};
const report=buildCumulativeReviewWorkbook([{
 storeId:store,total:1,limit:10,offset:0,hasMore:false,
 orders:[source],
}],store,"2026-11-04");
const lineKey=oid+":line:1";
const planKey=oid+":plan:"+pid;
const getSnapshot=(records=[])=>({
 schema_version:1,store_id:store,source:"held_review_annotations",
 records,shipping_enabled:false,fulfillment_updated:false,
});
const row=(key,state="reviewed",note="Reviewed",version=1)=>({
 row_key:key,review_state:state,review_note:note,review_version:version,
});
const receipt=(more={})=>({
 schema_version:1,store_id:store,status:"applied",processed:1,
 updated:1,unchanged:0,already_recorded:0,order_created:false,
 shipment_modified:false,payment_modified:false,
 shipping_modified:false,...more,
});
const edit=(csv,key,value)=>{
 const cells=parseCsvCells(csv,{maxRows:1002,maxChars:750000});
 const index=cells[0].indexOf(key);
 const result=cells.map((r,i)=>{
  if(i===1){const next=[...r];next[index]=value;return next;}
  return r;
 });
 return result.map(c=>c.map(s=>/[",\r\n]/.test(s)?
  '"'+s.replaceAll('"','""')+'"':s).join(",")).join("\r\n")+"\r\n";
};
test("empty projection preserves all original source rows without changes",()=>{
 const parsed=parseAnnotationSnapshot(getSnapshot(),store);
 assert.ok(parsed);
 const current=mergeAnnotationSnapshot(report.rows,store,parsed);
 assert.ok(current);
 assert.equal(current.length,2);
 assert.equal(current[0].review_version,"0");
 assert.equal(current[1].review_state,"unreviewed");
 assert.equal(Object.isFrozen(current),true);
});
test("store-authorized annotations overlay only review fields and version",()=>{
 const parsed=parseAnnotationSnapshot(
  getSnapshot([row(lineKey,"needs_attention","Review note",2)]),store);
 assert.ok(parsed);
 const merged=mergeAnnotationSnapshot(report.rows,store,parsed);
 assert.ok(merged);
 assert.equal(merged[0].review_state,"needs_attention");
 assert.equal(merged[0].review_note,"Review note");
 assert.equal(merged[0].review_version,"2");
 assert.equal(merged[0].order_id,oid);
 assert.equal(merged[0].purchased_quantity,"2");
 assert.equal(merged[0].planned_quantity,"1");
 assert.equal(merged[1].review_version,"0");
});
test("review note CSV edits produce only allowed atomic payload fields",()=>{
 const base=mergeAnnotationSnapshot(report.rows,store,
  parseAnnotationSnapshot(getSnapshot(),store));
 const csv=serializeCumulativeReviewCsv(base,store);
 const edited=edit(csv,"review_state","reviewed");
 const preview=previewCumulativeReviewImport(edited,base,store);
 assert.equal(preview.status,"preview_only");
 assert.equal(preview.changedRows,1);
 const changes=buildReviewAnnotationUploadChanges(preview,base,store);
 assert.equal(changes.length,1);
 assert.deepEqual(changes[0],{
  order_id:oid,row_kind:"order_line",line_number:1,
  shipment_id:null,source_revision:0,review_version:0,
  review_state:"reviewed",review_note:"",
 });
 assert.equal(Object.keys(changes[0]).length,8);
 assert.equal(Object.isFrozen(changes),true);
});
test("repeated CSV from an earlier review only reports already-matching content",()=>{
 const first=parseAnnotationSnapshot(getSnapshot(),store);
 const start=mergeAnnotationSnapshot(report.rows,store,first);
 const edited=edit(serializeCumulativeReviewCsv(start,store),
  "review_state","reviewed");
 const newer=mergeAnnotationSnapshot(report.rows,store,
  parseAnnotationSnapshot(getSnapshot([row(lineKey,"reviewed","",1)]),store));
 const preview=previewCumulativeReviewImport(edited,newer,store);
 assert.equal(preview.status,"preview_only");
 assert.equal(preview.changedRows,0);
 assert.equal(preview.alreadyRecordedRows,2);
});
test("different stale note is rejected even if source plan revision is unchanged",()=>{
 const start=mergeAnnotationSnapshot(report.rows,store,
  parseAnnotationSnapshot(getSnapshot(),store));
 const edited=edit(serializeCumulativeReviewCsv(start,store),
  "review_state","needs_attention");
 const newer=mergeAnnotationSnapshot(report.rows,store,
  parseAnnotationSnapshot(getSnapshot([row(lineKey,"reviewed","",1)]),store));
 const preview=previewCumulativeReviewImport(edited,newer,store);
 assert.equal(preview.status,"rejected");
 assert.equal(preview.issues[0].code,"stale_review_version");
 assert.equal(preview.changedRows,0);
 assert.throws(()=>buildReviewAnnotationUploadChanges(preview,newer,store));
});
test("unknown annotation keys, cross-store data and private extra fields fail closed",()=>{
 assert.equal(parseAnnotationSnapshot(getSnapshot(), "62000000-0000-0000-0000-000000000002"),null);
 assert.equal(parseAnnotationSnapshot({
  ...getSnapshot(),recipient_email:"private",
 },store),null);
 assert.equal(parseAnnotationSnapshot(getSnapshot([{
  ...row(lineKey),shipping_address:"private",
 }]),store),null);
 assert.equal(parseAnnotationSnapshot(getSnapshot([row(lineKey,"reviewed",
  "person@example.org")]),store),null);
 assert.equal(parseAnnotationSnapshot(getSnapshot([row(lineKey),row(lineKey)]),store),null);
 const unknown=oid+":line:99";
 const parsed=parseAnnotationSnapshot(getSnapshot([row(unknown)]),store);
 assert.ok(parsed);
 assert.equal(mergeAnnotationSnapshot(report.rows,store,parsed),null);
});
test("atomic result receipt requires exact reconciliation and no external change",()=>{
 const valid=parseAnnotationReceipt(receipt(),store,1);
 assert.ok(valid);assert.equal(valid.updated,1);
 assert.equal(valid.canChangeExternalState,false);
 for(const altered of [
  {order_created:true},{payment_modified:true},
  {shipment_modified:true},{shipping_modified:true},
  {processed:2},{updated:2},{unchanged:2},{already_recorded:1},
  {status:"shipped"},{shipping_address:"secret"},
 ]){
  assert.equal(parseAnnotationReceipt(receipt(altered),store,1),null);
 }
 assert.equal(parseAnnotationReceipt(receipt(),"62000000-0000-0000-0000-000000000002",1),null);
});
test("application import uses caller workspace and a fresh snapshot, never a privileged client",()=>{
 const action=readFileSync("src/app/supplier/reports/fulfillment/actions.ts","utf8");
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/readCompleteReviewWorkbook/);
 assert.match(action,/previewCumulativeReviewImport/);
 assert.match(action,/apply_supplier_cumulative_review_annotations/);
 assert.doesNotMatch(action,/service_role|SUPABASE_SERVICE_ROLE|purchaseLabel|decryptAddress/);
});
