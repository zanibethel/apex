/**
 * Issue #217 Phase 1: REVIEW-ONLY supplier email/attachment contract.
 *
 * This module does not send mail, access providers or grant a download token.
 * The report input must be a complete supplier-scoped, synthetic HELD-order
 * workbook. Its output deliberately excludes product titles, buyer data,
 * review notes, tracking IDs, email addresses and payment data.
 */
import {createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INT=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;
const ESC=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;')
 .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fail=()=>{throw Error('Review-only email attachment source rejected');};
export const REVIEW_ATTACHMENT_HEADERS=Object.freeze([
 'store_id','order_id','original_purchased_at_utc','row_kind',
 'line_number','purchased_units','planned_units','unplanned_units',
 'shipment_plan_id','plan_revision','review_version',
]);
const ROW_KINDS=new Set(['order_line','shipment_plan','incomplete_order']);
const key=r=>r.row_kind==='order_line'?
 r.order_id+':line:'+r.line_number:r.row_kind==='shipment_plan'?
 r.order_id+':plan:'+r.shipment_id:r.order_id+':incomplete';
const id=x=>typeof x==='string'&&UUID.test(x);
const day=x=>typeof x==='string'&&DAY.test(x)&&
 !Number.isNaN(Date.parse(x+'T00:00:00Z'))&&
 new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const utc=x=>typeof x==='string'&&UTC.test(x)&&
 !Number.isNaN(Date.parse(x))&&new Date(x).toISOString()===x;
function verifySource(report,storeId,reportDay){
 if(!report||report.storeId!==storeId||report.reportDay!==reportDay||
  !id(storeId)||!day(reportDay)||report.source!=='held_review_only'||
  report.complete!==true||report.canShip!==false||
  report.canSendEmail!==false||report.canUploadToDatabase!==false||
  !INT(report.totalOrders)||report.totalOrders>100||
  !report.summary||!Array.isArray(report.rows)||
  report.rows.length>1000)return fail();
 const summary=report.summary;
 for(const f of ['newToday','carriedForward','partiallyPlanned',
  'fullyPlannedReview','unplanned','incomplete','shipped','completed']){
  if(!INT(summary[f]))return fail();
 }
 if(summary.newToday+summary.carriedForward!==report.totalOrders||
  summary.shipped!==0||summary.completed!==0)return fail();
 const orders=new Set(),seen=new Set(),lines=[];
 for(const r of report.rows){
  if(!r||r.store_id!==storeId||!id(r.order_id)||
   !utc(r.purchased_at_utc)||
   !ROW_KINDS.has(r.row_kind)||
   r.review_state===undefined||r.review_note===undefined||
   !/^(0|[1-9]\d{0,4})$/.test(String(r.review_version))||
   !/^(0|[1-9]\d{0,3})$/.test(String(r.source_revision)))
   return fail();
  if(r.row_kind==='order_line'){
   if(!/^[1-9]\d?$/.test(String(r.line_number))||
    !['purchased_quantity','planned_quantity','unplanned_quantity']
     .every(f=>/^(0|[1-9]\d{0,5})$/.test(String(r[f])))||
    Number(r.planned_quantity)+Number(r.unplanned_quantity)!==
     Number(r.purchased_quantity)||
    r.shipment_id!=='')return fail();
  }else if(r.row_kind==='shipment_plan'){
   if(!id(r.shipment_id)||
    !/^[1-9]\d{0,3}$/.test(String(r.source_revision))||
    !/^[1-9]\d{0,5}$/.test(String(r.planned_quantity))||
    r.line_number!==''||r.purchased_quantity!==''||
    r.unplanned_quantity!=='')return fail();
  }else if(r.line_number!==''||r.purchased_quantity!==''||
   r.planned_quantity!==''||r.unplanned_quantity!==''||
   r.shipment_id!=='')return fail();
  const k=key(r);
  if(seen.has(k))return fail();
  seen.add(k);orders.add(r.order_id);
  lines.push([
   storeId,r.order_id,r.purchased_at_utc,r.row_kind,
   r.row_kind==='order_line'?String(r.line_number):'',
   r.row_kind==='order_line'?String(r.purchased_quantity):'',
   r.row_kind==='incomplete_order'?'':String(r.planned_quantity),
   r.row_kind==='order_line'?String(r.unplanned_quantity):'',
   r.row_kind==='shipment_plan'?r.shipment_id:'',
   r.row_kind==='shipment_plan'?String(r.source_revision):'',
   String(r.review_version),
  ]);
 }
 if(orders.size!==report.totalOrders)return fail();
 lines.sort((a,b)=>{
  const ka=a[1]+':'+a[3]+':'+a[4]+':'+a[8];
  const kb=b[1]+':'+b[3]+':'+b[4]+':'+b[8];
  return ka.localeCompare(kb);
 });
 return {lines,summary};
}
export function createSupplierReviewEmailPreview(report,storeId,reportDay){
 const {lines,summary}=verifySource(report,storeId,reportDay);
 // All attachment fields have known safe types; no free-text source values.
 const csv=[REVIEW_ATTACHMENT_HEADERS.join(','),
  ...lines.map(c=>c.join(','))].join('\r\n')+'\r\n';
 if(csv.length>400000)return fail();
 const digest=createHash('sha256').update(csv,'utf8').digest('hex');
 const manifest=Object.freeze({
  schemaVersion:1,storeId,reportDay,
  attachmentName:'apex-review-'+reportDay+'-'+storeId.slice(0,8)+'.csv',
  attachmentMediaType:'text/csv',digestSha256:digest,
  attachmentBytes:Buffer.byteLength(csv,'utf8'),
  orders:report.totalOrders,rows:lines.length,
  newToday:summary.newToday,carriedForward:summary.carriedForward,
  partlyPlanned:summary.partiallyPlanned,
  fullyPlannedReview:summary.fullyPlannedReview,
  notPlanned:summary.unplanned,incomplete:summary.incomplete,
  shippedVerified:0,deliveredVerified:0,
  requiresAuthenticatedAccess:true,
  providerAccepted:false,inboxDelivered:false,
  canSend:false,canShip:false,
 });
 return Object.freeze({manifest,csv});
}
export function renderSupplierReviewEmailPreview(manifest){
 if(!manifest||manifest.schemaVersion!==1||
  !id(manifest.storeId)||!day(manifest.reportDay)||
  !/^[0-9a-f]{64}$/.test(manifest.digestSha256??'')||
  !INT(manifest.orders)||!INT(manifest.rows)||
  !INT(manifest.newToday)||!INT(manifest.carriedForward)||
  manifest.newToday+manifest.carriedForward!==manifest.orders||
  !INT(manifest.partlyPlanned)||!INT(manifest.fullyPlannedReview)||
  !INT(manifest.notPlanned)||!INT(manifest.incomplete)||
  manifest.shippedVerified!==0||manifest.deliveredVerified!==0||
  manifest.canSend!==false||manifest.canShip!==false||
  manifest.requiresAuthenticatedAccess!==true||
  manifest.providerAccepted!==false||manifest.inboxDelivered!==false)
  return fail();
 const stats=[
  ['Original held orders',manifest.orders],
  ['New on report date',manifest.newToday],
  ['Carried forward',manifest.carriedForward],
  ['Partially planned',manifest.partlyPlanned],
  ['Fully planned (not shipped)',manifest.fullyPlannedReview],
  ['Not planned',manifest.notPlanned],
  ['Incomplete source',manifest.incomplete],
 ];
 const tr=stats.map(([label,value])=>
  '<tr><td style="padding:10px;border-bottom:1px solid #41414a;">'+
  ESC(label)+'</td><td style="padding:10px;text-align:right;border-bottom:1px solid #41414a;">'+
  ESC(value)+'</td></tr>').join('');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="margin:0;background:#101116;color:#f3f4f6;font-family:Arial,sans-serif;">'+
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">'+
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#22232a;">'+
  '<tr><td style="padding:24px;border-bottom:3px solid #ab2344;">'+
  '<strong>APEX · SUPPLIER REPORT</strong><h1 style="font-size:22px;">Review snapshot</h1>'+
  '<p>Report date: '+ESC(manifest.reportDay)+' (America/Chicago)</p></td></tr>'+
  '<tr><td style="padding:20px;">'+
  '<p>This snapshot covers held records for planning review only. It does not verify payment, shipment or delivery.</p>'+
  '<table width="100%" role="presentation">'+tr+'</table>'+
  '<p style="font-size:13px;">The metadata-only CSV preview can be downloaded from your authenticated supplier dashboard. Customer addresses and contact details are not included.</p>'+
  '<p><a href="https://apexanabolics.co/supplier/reports/fulfillment" style="color:#f4c0ce;">Open protected report</a></p>'+
  '<p style="font-size:12px;">No message has been sent by this preview.</p>'+
  '</td></tr></table></td></tr></table></body></html>';
 return Object.freeze({
  subject:'Supplier review snapshot — '+manifest.reportDay,
  text:'Supplier review snapshot '+manifest.reportDay+
   '\nOriginal held orders: '+manifest.orders+
   '\nNew today: '+manifest.newToday+
   '\nCarried forward: '+manifest.carriedForward+
   '\nPartially planned: '+manifest.partlyPlanned+
   '\nFully planned (not shipped): '+manifest.fullyPlannedReview+
   '\nNot planned: '+manifest.notPlanned+
   '\nIncomplete source: '+manifest.incomplete+
   '\nThis does not confirm shipping or delivery.'+
   '\nProtected report: https://apexanabolics.co/supplier/reports/fulfillment',
  html,
 });
}
