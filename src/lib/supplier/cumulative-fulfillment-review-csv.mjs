/**
 * Issue #216: review-only cumulative held-order CSV + local import preview.
 * No PII, persistence, shipping, email delivery, or privileged DB writes.
 */
import {parseCsvCells} from './sales-reconciliation-csv.mjs';
import {centralDateKey} from './daily-order-report.mjs';

export const HEADERS=Object.freeze([
 'store_id','row_kind','order_id','order_reference','purchased_at_utc',
 'line_number','sku','item_title','purchased_quantity','planned_quantity',
 'unplanned_quantity','shipment_id','shipment_reference','source_revision',
 'carrier_draft','tracking_draft','review_state','review_note',
]);
const IMMUTABLE=HEADERS.filter(x=>!['review_state','review_note'].includes(x));
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const NAT=/^(?:0|[1-9]\d{0,5})$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const STATES=new Set(['unreviewed','reviewed','needs_attention']);
const KINDS=new Set(['incomplete_order','order_line','shipment_plan']);
const exact=(x,fields)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const txt=(s,min,max)=>typeof s==='string'&&s.length>=min&&s.length<=max&&
 s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s);
const utc=s=>typeof s==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&
 !Number.isNaN(Date.parse(s))&&new Date(s).toISOString()===s;
const deny=code=>{const e=new Error('Review-only report denied');e.code=code;throw e;};
const csvCell=x=>{
 let s=String(x??'');
 if(/^[=+\-@\t\r]/.test(s))s="'"+s;
 return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
};
const unescape=x=>/^'[=+\-@]/.test(x)?x.slice(1):x;
const identity=r=>r.row_kind==='order_line'?
 r.order_id+':line:'+r.line_number:r.row_kind==='shipment_plan'?
 r.order_id+':plan:'+r.shipment_id:r.order_id+':incomplete';
const blank=x=>x==='';
function assertRow(r,storeId){
 if(!exact(r,HEADERS)||r.store_id!==storeId||
  !UUID.test(r.order_id??'')||!txt(r.order_reference,1,200)||
  !utc(r.purchased_at_utc)||!KINDS.has(r.row_kind)||
  !STATES.has(r.review_state)||!txt(r.review_note,0,240)||
  !NAT.test(String(r.source_revision))||!txt(r.sku,0,160)||
  !txt(r.item_title,0,240)||!txt(r.shipment_reference,0,100)||
  !txt(r.carrier_draft,0,8)||!txt(r.tracking_draft,0,40)||
  !['','USPS','UPS','FEDEX','DHL'].includes(r.carrier_draft)||
  (r.carrier_draft===''?!blank(r.tracking_draft):
   !/^[A-Z0-9]{8,40}$/.test(r.tracking_draft)))
  deny('invalid_row');
 for(const f of ['line_number','purchased_quantity','planned_quantity',
  'unplanned_quantity']){
  if(!blank(String(r[f]))&&!NAT.test(String(r[f])))deny('invalid_quantity');
 }
 if(r.row_kind==='order_line'){
  if(!NAT.test(String(r.line_number))||Number(r.line_number)<1||
   !txt(r.sku,1,160)||!txt(r.item_title,1,240)||
   !NAT.test(String(r.purchased_quantity))||
   !NAT.test(String(r.planned_quantity))||
   !NAT.test(String(r.unplanned_quantity))||
   Number(r.planned_quantity)+Number(r.unplanned_quantity)!==
    Number(r.purchased_quantity)||!blank(r.shipment_id)||
   !blank(r.shipment_reference)||Number(r.source_revision)!==0||
   !blank(r.carrier_draft)||!blank(r.tracking_draft))
   deny('invalid_line_row');
 }else if(r.row_kind==='shipment_plan'){
  if(!UUID.test(r.shipment_id??'')||
   !txt(r.shipment_reference,1,100)||
   !blank(String(r.line_number))||!blank(r.sku)||!blank(r.item_title)||
   !blank(String(r.purchased_quantity))||
   !blank(String(r.unplanned_quantity))||
   !NAT.test(String(r.planned_quantity))||
   Number(r.planned_quantity)<1||Number(r.source_revision)<1)
   deny('invalid_plan_row');
 }else if(!blank(String(r.line_number))||!blank(r.sku)||
  !blank(r.item_title)||!blank(String(r.purchased_quantity))||
  !blank(String(r.planned_quantity))||
  !blank(String(r.unplanned_quantity))||!blank(r.shipment_id)||
  !blank(r.shipment_reference)||Number(r.source_revision)!==0||
  !blank(r.carrier_draft)||!blank(r.tracking_draft))
  deny('invalid_incomplete_row');
}
const row=(o,kind,vals={})=>Object.freeze({
 store_id:o.storeId,row_kind:kind,order_id:o.id,
 order_reference:o.reference,purchased_at_utc:o.purchasedAt,
 line_number:String(vals.line??''),sku:vals.sku??'',
 item_title:vals.title??'',
 purchased_quantity:String(vals.purchased??''),
 planned_quantity:String(vals.planned??''),
 unplanned_quantity:String(vals.unplanned??''),
 shipment_id:vals.shipmentId??'',shipment_reference:vals.shipmentRef??'',
 source_revision:String(vals.revision??0),carrier_draft:vals.carrier??'',
 tracking_draft:vals.tracking??'',review_state:'unreviewed',review_note:'',
});
export function buildCumulativeReviewWorkbook(pages,storeId,reportDay){
 if(!UUID.test(storeId??'')||!DATE.test(reportDay??'')||
  Number.isNaN(Date.parse(reportDay+'T00:00:00Z'))||
  new Date(reportDay+'T00:00:00Z').toISOString().slice(0,10)!==reportDay||
  !Array.isArray(pages)||pages.length<1||pages.length>10)
  deny('invalid_source');
 const total=pages[0]?.total;
 if(!Number.isSafeInteger(total)||total<0||total>100)
  deny('too_many_orders');
 const orders=[],seen=new Set();let previous=null;
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(p?.storeId!==storeId||p.limit!==10||p.offset!==i*10||
   p.total!==total||!Array.isArray(p.orders)||
   p.hasMore!==((i+1)*10<total)||
   (i<pages.length-1&&p.orders.length!==10))
   deny('incomplete_or_changed_pages');
  for(const o of p.orders){
   if(!UUID.test(o.id??'')||o.storeId!==storeId||
    seen.has(o.id)||!utc(o.purchasedAt))deny('invalid_order');
   const cursor=o.purchasedAt+':'+o.id;
   if(previous!==null&&cursor>=previous)deny('changed_order_pages');
   if(centralDateKey(new Date(o.purchasedAt))>reportDay)
    deny('future_original_purchase');
   previous=cursor;seen.add(o.id);orders.push(o);
  }
 }
 if(orders.length!==total||pages.at(-1).hasMore)
  deny('incomplete_or_changed_pages');
 const rows=[],summary={newToday:0,carriedForward:0,
  partiallyPlanned:0,fullyPlannedReview:0,unplanned:0,incomplete:0,
  shipped:0,completed:0};
 for(const o of orders){
  if(!txt(o.reference,1,200))deny('invalid_order');
  if(centralDateKey(new Date(o.purchasedAt))===reportDay)summary.newToday++;
  else summary.carriedForward++;
  if(o.readiness==='incomplete'){
   if(o.lines.length||o.plans.length||o.purchasedUnits!==null||
    o.plannedUnits!==null||o.unplannedUnits!==null)
    deny('incomplete_source_leak');
   summary.incomplete++;rows.push(row(o,'incomplete_order'));
   continue;
  }
  if(o.readiness!=='held'||o.lines.length<1||
   o.canShip!==false||o.canBuyLabel!==false||
   o.canEnterTracking!==false)deny('unauthorized_source');
  if(o.plannedUnits>0&&o.unplannedUnits>0)summary.partiallyPlanned++;
  if(o.plannedUnits>0&&o.unplannedUnits===0)summary.fullyPlannedReview++;
  if(o.plannedUnits===0)summary.unplanned++;
  for(const l of o.lines)rows.push(row(o,'order_line',{
   line:l.number,sku:l.sku,title:l.title,purchased:l.purchased,
   planned:l.planned,unplanned:l.unplanned,
  }));
  for(const p of o.plans){
   const last=p.drafts.at(-1);
   rows.push(row(o,'shipment_plan',{
    shipmentId:p.id,shipmentRef:p.reference,revision:p.revision,
    planned:p.plannedUnits,carrier:last?.carrier??'',
    tracking:last?.reference??'',
   }));
  }
 }
 if(rows.length>1000)deny('too_many_rows');
 const keys=new Set();
 for(const r of rows){
  assertRow(r,storeId);
  const k=identity(r);if(keys.has(k))deny('duplicate_source_row');
  keys.add(k);
 }
 return Object.freeze({storeId,reportDay,totalOrders:total,
  summary:Object.freeze(summary),rows:Object.freeze(rows),
  source:'held_review_only',complete:true,
  canShip:false,canSendEmail:false,canUploadToDatabase:false});
}
export function serializeCumulativeReviewCsv(rows,storeId){
 if(!UUID.test(storeId??'')||!Array.isArray(rows)||rows.length>1000)
  deny('invalid_export');
 const lines=[HEADERS.join(',')],keys=new Set();
 for(const r of rows){
  assertRow(r,storeId);
  const k=identity(r);if(keys.has(k))deny('duplicate_source_row');
  keys.add(k);
  lines.push(HEADERS.map(h=>csvCell(r[h])).join(','));
 }
 const result=lines.join('\r\n')+'\r\n';
 if(result.length>750000)deny('csv_too_large');
 return result;
}
export function previewCumulativeReviewImport(csv,currentRows,storeId){
 if(!UUID.test(storeId??'')||!Array.isArray(currentRows)||
  currentRows.length>1000)deny('invalid_current_snapshot');
 const current=new Map();
 for(const r of currentRows){
  assertRow(r,storeId);const k=identity(r);
  if(current.has(k))deny('duplicate_current_record');
  current.set(k,r);
 }
 const cells=parseCsvCells(csv,{maxRows:1002,maxChars:750000});
 if(!cells.length||cells[0].join(',')!==HEADERS.join(','))
  deny('unsupported_template');
 const unique=new Map(),issues=[],changes=[];
 let duplicates=0,unchanged=0,stale=0,alreadyRecorded=0;
 for(let i=1;i<cells.length;i++){
  const fields=cells[i];if(fields.length!==HEADERS.length)
   deny('wrong_columns');
  const r=Object.fromEntries(HEADERS.map((h,j)=>[h,unescape(fields[j])]));
  if(r.store_id!==storeId)deny('foreign_store');
  assertRow(r,storeId);
  const k=identity(r),prev=unique.get(k);
  if(prev){
   if(HEADERS.some(h=>String(prev[h])!==String(r[h])))
    issues.push(Object.freeze({line:i+1,code:'conflicting_duplicate',key:k}));
   else duplicates++;
   continue;
  }
  unique.set(k,r);
  const source=current.get(k);
  if(!source){
   issues.push(Object.freeze({line:i+1,code:'unknown_row',key:k}));
   continue;
  }
  if(r.source_revision!==String(source.source_revision)){
   stale++;issues.push(Object.freeze({line:i+1,code:'stale_revision',key:k}));
   continue;
  }
  if(IMMUTABLE.some(h=>String(r[h])!==String(source[h]))){
   issues.push(Object.freeze({line:i+1,code:'immutable_field_changed',key:k}));
   continue;
  }
  if(r.review_state!==source.review_state||
   r.review_note!==source.review_note){
   changes.push(Object.freeze({key:k,orderId:source.order_id,
    rowKind:source.row_kind,to:r.review_state,
    proposedNote:r.review_note}));
  }else{unchanged++;alreadyRecorded++;}
 }
 return Object.freeze({
  status:issues.length?'rejected':'preview_only',
  uploadedRows:cells.length-1,uniqueRows:unique.size,
  uniqueOrders:new Set([...unique.values()].map(r=>r.order_id)).size,
  duplicatesInFile:duplicates,staleRows:stale,
  changedRows:issues.length?0:changes.length,
  proposedChanges:issues.length?Object.freeze([]):Object.freeze(changes),
  unchangedRows:unchanged,alreadyRecordedRows:alreadyRecorded,
  conflicts:issues.length,issues:Object.freeze(issues),
  databaseUpdated:false,fulfillmentUpdated:false,
  canShip:false,canUploadToDatabase:false,
 });
}
/** In-memory *simulation* only. No persisted/approved supplier write. */
export function applyCumulativeReviewPreviewLocally(rows,preview){
 if(preview?.status!=='preview_only'||!Array.isArray(rows)||
  !Array.isArray(preview.proposedChanges))deny('unapproved_preview');
 const edits=new Map(preview.proposedChanges.map(c=>[c.key,c]));
 if(edits.size!==preview.proposedChanges.length)deny('duplicate_preview');
 return Object.freeze(rows.map(r=>{
  const c=edits.get(identity(r));
  return c?Object.freeze({...r,review_state:c.to,
   review_note:c.proposedNote}):r;
 }));
}
export function serializeCumulativeReviewErrorCsv(preview){
 if(!Array.isArray(preview?.issues)||preview.issues.length>1000)
  deny('invalid_error_report');
 return ['csv_line,record_key,error_code',...preview.issues.map(i=>
  [i.line,i.key,i.code].map(csvCell).join(','))].join('\r\n')+'\r\n';
}
