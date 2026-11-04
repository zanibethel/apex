import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 HEADERS,buildCumulativeReviewWorkbook,serializeCumulativeReviewCsv,
 previewCumulativeReviewImport,applyCumulativeReviewPreviewLocally,
 serializeCumulativeReviewErrorCsv,
} from '../src/lib/supplier/cumulative-fulfillment-review-csv.mjs';
import {parseCsvCells} from '../src/lib/supplier/sales-reconciliation-csv.mjs';

const store='62000000-0000-0000-0000-000000000001';
const foreign='62000000-0000-0000-0000-000000000002';
const uuid=(head,i)=>head+'-0000-4000-8000-'+String(i).padStart(12,'0');
const date=i=>new Date(Date.UTC(2026,10,3,20,0,i)).toISOString();
function order(i,{revision=1,day=3,planned=2,title='Synthetic item'}={}){
 const id=uuid('66000216',i),shipmentId=uuid('71000216',i);
 const purchasedAt=new Date(Date.UTC(2026,10,day,20,0,i)).toISOString();
 return {
  id,storeId:store,reference:'SYNTH-ORDER-'+i,purchasedAt,
  readiness:'held',purchasedUnits:3,plannedUnits:planned,
  unplannedUnits:3-planned,
  lines:[{number:1,sku:'SYNTH-'+i,title,variant:'',
   purchased:3,planned,unplanned:3-planned}],
  plans:planned?[{id:shipmentId,reference:'PLAN-'+i,
   revision,status:'review_only',plannedUnits:planned,
   drafts:revision>1?[{carrier:'USPS',reference:'9400000000000000'+
    String(i).padStart(4,'0'),revision:2,recordedAt:date(i)}]:[],
   canShip:false,canBuyLabel:false}]:[],
  canShip:false,canBuyLabel:false,canEnterTracking:false,
 };
}
const sorted=arr=>[...arr].sort((a,b)=>
 b.purchasedAt.localeCompare(a.purchasedAt)||b.id.localeCompare(a.id));
function pages(items){
 const list=sorted(items);
 return Array.from({length:Math.max(1,Math.ceil(list.length/10))},(_,i)=>({
  storeId:store,total:list.length,limit:10,offset:i*10,
  hasMore:(i+1)*10<list.length,orders:list.slice(i*10,(i+1)*10),
 }));
}
const workbook=(items,day='2026-11-04')=>
 buildCumulativeReviewWorkbook(pages(items),store,day);
const parse=(csv,rows)=>previewCumulativeReviewImport(csv,rows,store);
function change(csv,updates){
 const cells=parseCsvCells(csv,{maxRows:1002,maxChars:750000});
 const out=cells.map((r,i)=>i===0?r:updates(r,i));
 return out.map(row=>row.map(x=>/[,\"\r\n]/.test(x)?
  '"'+x.replaceAll('"','""')+'"':x).join(',')).join('\r\n')+'\r\n';
}
const idx=h=>HEADERS.indexOf(h);

test('cumulative metadata includes stable item/plan identities and no shipment claims',()=>{
 const w=workbook([order(1,{revision:2}),order(2,{planned:0})]);
 assert.equal(w.totalOrders,2);
 assert.equal(w.summary.carriedForward,2);
 assert.equal(w.summary.newToday,0);
 assert.equal(w.summary.partiallyPlanned,1);
 assert.equal(w.summary.unplanned,1);
 assert.equal(w.summary.shipped,0);
 assert.equal(w.summary.completed,0);
 assert.equal(w.rows.length,3);
 assert.equal(w.rows.filter(r=>r.row_kind==='shipment_plan').length,1);
 assert.equal(w.rows.find(r=>r.row_kind==='shipment_plan').source_revision,'2');
 assert.equal(w.canShip,false);
 assert.equal(w.canSendEmail,false);
 assert.equal(w.canUploadToDatabase,false);
 assert.doesNotMatch(JSON.stringify(w),/customer_address|recipient_name|ciphertext|nonce_base64|key_reference/);
});
test('20 day-3 orders carried forward on day 4 without duplicating orders or plans',()=>{
 const twenty=Array.from({length:20},(_,i)=>order(i+1));
 const onDay3=workbook(twenty,'2026-11-03');
 const onDay4=workbook(twenty,'2026-11-04');
 assert.equal(onDay3.summary.newToday,20);
 assert.equal(onDay4.summary.carriedForward,20);
 assert.equal(onDay3.rows.length,40);
 assert.equal(onDay4.rows.length,40);
 assert.equal(new Set(onDay4.rows.map(r=>r.order_id)).size,20);
 assert.equal(new Set(onDay4.rows.filter(r=>r.row_kind==='shipment_plan')
  .map(r=>r.shipment_id)).size,20);
 assert.equal(serializeCumulativeReviewCsv(onDay4.rows,store).split('\r\n').length,42);
});
test('day-3 edit over day-4 newer plan revisions is rejected all-or-nothing',()=>{
 const old=Array.from({length:20},(_,i)=>order(i+1));
 const changed=old.map((_,i)=>order(i+1,{revision:i<10?2:1}));
 const day3=workbook(old,'2026-11-03');
 const day4=workbook(changed,'2026-11-04');
 const before=serializeCumulativeReviewCsv(day3.rows,store);
 const edited=change(before,(r)=>{
  if(r[idx('row_kind')]==='shipment_plan'&&
   Number(r[idx('order_reference')].split('-').at(-1))<=10){
   r[idx('review_state')]='needs_attention';
   r[idx('review_note')]='Checked offline';
  }
  return r;
 });
 const preview=parse(edited,day4.rows);
 assert.equal(preview.status,'rejected');
 assert.equal(preview.uploadedRows,40);
 assert.equal(preview.uniqueOrders,20);
 assert.equal(preview.staleRows,10);
 assert.equal(preview.changedRows,0);
 assert.equal(preview.databaseUpdated,false);
 assert.equal(preview.issues.filter(i=>i.code==='stale_revision').length,10);
 const errorCsv=serializeCumulativeReviewErrorCsv(preview);
 assert.match(errorCsv,/stale_revision/);
 assert.equal(errorCsv.split('\r\n').length,12);
 assert.throws(()=>applyCumulativeReviewPreviewLocally(day4.rows,preview));
});
test('fresh day-4 edits preview 10 rows and exact replay changes none locally',()=>{
 const twenty=Array.from({length:20},(_,i)=>order(i+1,{revision:i<10?2:1}));
 const w=workbook(twenty);
 const csv=serializeCumulativeReviewCsv(w.rows,store);
 const edited=change(csv,r=>{
  if(r[idx('row_kind')]==='shipment_plan'&&
   Number(r[idx('order_reference')].split('-').at(-1))<=10){
   r[idx('review_state')]='reviewed';
   r[idx('review_note')]='Local note only';
  }
  return r;
 });
 const first=parse(edited,w.rows);
 assert.equal(first.status,'preview_only');
 assert.equal(first.changedRows,10);
 assert.equal(first.unchangedRows,30);
 assert.equal(first.uniqueOrders,20);
 assert.equal(first.databaseUpdated,false);
 const local=applyCumulativeReviewPreviewLocally(w.rows,first);
 assert.equal(local.length,40);
 assert.equal(new Set(local.map(r=>
  r.row_kind+':'+r.order_id+':'+r.shipment_id)).size,40);
 const same=parse(edited,local);
 assert.equal(same.status,'preview_only');
 assert.equal(same.changedRows,0);
 assert.equal(same.alreadyRecordedRows,40);
 assert.equal(same.unchangedRows,40);
});
test('same exact duplicate rows are suppressed, conflicting duplicate rejected',()=>{
 const w=workbook([order(1)]);
 const csv=serializeCumulativeReviewCsv(w.rows,store);
 const lines=csv.trimEnd().split('\r\n');
 const identical=lines.concat(lines[1]).join('\r\n')+'\r\n';
 const a=parse(identical,w.rows);
 assert.equal(a.status,'preview_only');
 assert.equal(a.duplicatesInFile,1);
 assert.equal(a.uniqueRows,2);
 const conflicting=change(identical,(r,i)=>{
  if(i===3)r[idx('review_note')]='Different offline note';
  return r;
 });
 const b=parse(conflicting,w.rows);
 assert.equal(b.status,'rejected');
 assert.equal(b.conflicts,1);
 assert.equal(b.issues[0].code,'conflicting_duplicate');
});
test('immutable source identity and supplier id cannot be rewritten by CSV',()=>{
 const w=workbook([order(1)]);
 const csv=serializeCumulativeReviewCsv(w.rows,store);
 for(const [field,value,expected] of [
  ['order_reference','REPLACED','immutable_field_changed'],
  ['item_title','Overwritten','immutable_field_changed'],
  ['planned_quantity','1','immutable_field_changed'],
  ['source_revision','999','stale_revision'],
 ]) {
  const edited=change(csv,(r,i)=>{
   if(i===1)r[idx(field)]=value;
   return r;
  });
  const result=parse(edited,w.rows);
  assert.equal(result.status,'rejected',field);
  assert.equal(result.issues[0].code,expected,field);
 }
 const cross=change(csv,(r)=>{r[idx('store_id')]=foreign;return r;});
 assert.throws(()=>parse(cross,w.rows),e=>e.code==='foreign_store');
});
test('unknown rows and incomplete source block changes, no fabricated orders',()=>{
 const w=workbook([order(1)]);
 const csv=serializeCumulativeReviewCsv(w.rows,store);
 const unknown=change(csv,(r,i)=>{
  if(i===1)r[idx('order_id')]=uuid('66000216',99);
  return r;
 });
 assert.equal(parse(unknown,w.rows).issues[0].code,'unknown_row');
 const incomplete={
  ...order(1),readiness:'incomplete',lines:[],plans:[],
  purchasedUnits:null,plannedUnits:null,unplannedUnits:null,
 };
 const pending=workbook([incomplete]);
 assert.equal(pending.rows.length,1);
 assert.equal(pending.rows[0].row_kind,'incomplete_order');
 assert.equal(pending.rows[0].purchased_quantity,'');
 assert.equal(pending.summary.incomplete,1);
});
test('CSV handles source formulas safely without changing signed-off snapshot',()=>{
 const w=workbook([order(1,{title:'=HYPERLINK("unsafe","x")'})]);
 const csv=serializeCumulativeReviewCsv(w.rows,store);
 assert.match(csv,/'=HYPERLINK/);
 const uploaded=parse(csv,w.rows);
 assert.equal(uploaded.status,'preview_only');
 assert.equal(uploaded.unchangedRows,2);
 const bad=csv.replace('review_state','unexpected_column');
 assert.throws(()=>parse(bad,w.rows),e=>e.code==='unsupported_template');
});
test('cross-page loss, duplicates, too many records, and unsafe source claims fail closed',()=>{
 const items=Array.from({length:20},(_,i)=>order(i+1));
 const pp=pages(items);
 assert.throws(()=>buildCumulativeReviewWorkbook([pp[0]],store,'2026-11-04'));
 assert.throws(()=>buildCumulativeReviewWorkbook([pp[0],pp[0]],store,'2026-11-04'));
 const duplicate=pages([order(1),order(1)]);
 assert.throws(()=>buildCumulativeReviewWorkbook(duplicate,store,'2026-11-04'));
 assert.throws(()=>workbook(Array.from({length:101},(_,i)=>order(i+1))));
 const forged=pages([order(1)]);
 forged[0].orders[0]={...forged[0].orders[0],canShip:true};
 assert.throws(()=>buildCumulativeReviewWorkbook(forged,store,'2026-11-04'));
});
test('workbook logic never performs writes, sends email, buys labels or decrypts',()=>{
 const source=readFileSync('src/lib/supplier/cumulative-fulfillment-review-csv.mjs','utf8');
 assert.doesNotMatch(source,/process\.env|fetch\(|\.rpc\(|createClient|purchaseLabel|sendEmail|decryptAddress|localStorage/);
 assert.match(source,/canUploadToDatabase:false/);
});
