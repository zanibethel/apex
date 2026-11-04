/**
 * Issue #215 Phase 2 — fail-closed supplier demo queue parser.
 * Accepts only the private membership-scoped disposable database projection.
 * No user input can establish a real order, shipment, carrier acceptance
 * or customer destination.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TRACK=/^[A-Z0-9]{8,40}$/;
const CARRIERS=new Set(['USPS','UPS','FEDEX','DHL']);
const TOP=['schema_version','store_id','source','total','limit','offset',
 'has_more','orders','shipping_enabled','label_purchase_enabled',
 'tracking_entry_enabled','delivery_decryption_enabled'];
const ORDER=['order_id','order_reference','purchased_at_utc','readiness',
 'lines','plans','purchased_units','planned_units','unplanned_units',
 'can_ship','can_buy_label','can_enter_tracking'];
const LINE=['line_number','sku','title','variant','purchased_quantity',
 'planned_quantity','unplanned_quantity'];
const PLAN=['shipment_id','reference','revision','status','planned_units',
 'tracking_drafts','can_ship','can_buy_label'];
const DRAFT=['carrier','tracking_reference','revision','recorded_at_utc'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
const text=(x,min,max)=>typeof x==='string'&&x.length>=min&&
 x.length<=max&&x.trim()===x&&!/[\x00-\x1f\x7f]/.test(x);
const date=x=>typeof x==='string'&&DATE.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
function parseOrder(row,storeId,seenTracking){
 if(!exact(row,ORDER)||!UUID.test(row.order_id??'')||
  !text(row.order_reference,1,200)||!date(row.purchased_at_utc)||
  !Array.isArray(row.lines)||!Array.isArray(row.plans)||
  row.can_ship!==false||row.can_buy_label!==false||
  row.can_enter_tracking!==false)return null;
 if(row.readiness==='incomplete_held_record'){
  if(row.lines.length||row.plans.length||row.purchased_units!==null||
   row.planned_units!==null||row.unplanned_units!==null)return null;
  return Object.freeze({
   id:row.order_id,storeId,reference:row.order_reference,
   purchasedAt:row.purchased_at_utc,readiness:'incomplete',
   purchasedUnits:null,plannedUnits:null,unplannedUnits:null,
   lines:Object.freeze([]),plans:Object.freeze([]),
   canShip:false,canBuyLabel:false,canEnterTracking:false,
  });
 }
 if(row.readiness!=='held_review_only'||row.lines.length<1||
  row.lines.length>50||row.plans.length>100||
  ![row.purchased_units,row.planned_units,row.unplanned_units]
   .every(n=>integer(n,5000)))return null;
 let purchased=0,planned=0;
 const lines=[];
 for(let i=0;i<row.lines.length;i++){
  const l=row.lines[i];
  if(!exact(l,LINE)||l.line_number!==i+1||
    !text(l.sku,1,160)||!text(l.title,1,240)||
    !text(l.variant,0,140)||
    !integer(l.purchased_quantity,100)||l.purchased_quantity===0||
    !integer(l.planned_quantity,100)||
    !integer(l.unplanned_quantity,100)||
    l.planned_quantity+l.unplanned_quantity!==l.purchased_quantity)
     return null;
  purchased+=l.purchased_quantity;
  planned+=l.planned_quantity;
  lines.push(Object.freeze({
   number:l.line_number,sku:l.sku,title:l.title,variant:l.variant,
   purchased:l.purchased_quantity,planned:l.planned_quantity,
   unplanned:l.unplanned_quantity,
  }));
 }
 if(purchased!==row.purchased_units||planned!==row.planned_units||
  purchased-planned!==row.unplanned_units)return null;
 const seenIds=new Set(),seenRefs=new Set();
 const plans=[];
 let totalPlanUnits=0,prevPlan=null;
 for(const p of row.plans){
  if(!exact(p,PLAN)||!UUID.test(p.shipment_id??'')||
   !text(p.reference,1,100)||
   !/^[A-Za-z0-9._:-]{1,100}$/.test(p.reference)||
   seenIds.has(p.shipment_id)||seenRefs.has(p.reference)||
   !integer(p.revision,1000)||p.revision===0||
   p.status!=='review_only'||!integer(p.planned_units,5000)||
   p.planned_units===0||!Array.isArray(p.tracking_drafts)||
   p.tracking_drafts.length>1000||
   p.can_ship!==false||p.can_buy_label!==false)return null;
  seenIds.add(p.shipment_id);seenRefs.add(p.reference);
  // Plans have an order-preserving creation timestamp in SQL but the
  // projection intentionally does not expose private audit internals.
  const drafts=[];
  for(let i=0;i<p.tracking_drafts.length;i++){
   const d=p.tracking_drafts[i];
   if(!exact(d,DRAFT)||!CARRIERS.has(d.carrier)||
    typeof d.tracking_reference!=='string'||
    !TRACK.test(d.tracking_reference)||
    d.revision!==i+2||!date(d.recorded_at_utc))return null;
   const key=d.carrier+':'+d.tracking_reference;
   if(seenTracking.has(key))return null;
   seenTracking.add(key);
   drafts.push(Object.freeze({
    carrier:d.carrier,reference:d.tracking_reference,
    revision:d.revision,recordedAt:d.recorded_at_utc,
   }));
  }
  if(p.revision!==p.tracking_drafts.length+1)return null;
  totalPlanUnits+=p.planned_units;
  if(totalPlanUnits>planned)return null;
  plans.push(Object.freeze({
   id:p.shipment_id,reference:p.reference,revision:p.revision,
   status:'review_only',plannedUnits:p.planned_units,
   drafts:Object.freeze(drafts),
   canShip:false,canBuyLabel:false,
  }));
 }
 if(totalPlanUnits!==planned)return null;
 return Object.freeze({
  id:row.order_id,storeId,reference:row.order_reference,
  purchasedAt:row.purchased_at_utc,readiness:'held',
  purchasedUnits:purchased,plannedUnits:planned,
  unplannedUnits:purchased-planned,lines:Object.freeze(lines),
  plans:Object.freeze(plans),canShip:false,canBuyLabel:false,
  canEnterTracking:false,
 });
}
/**
 * Parse exactly one store's review-only data. Any bad row rejects the entire
 * response, preventing accidental cross-store or sensitive data exposure.
 */
export function parseSupplierReviewFulfillmentQueue(input,storeId,{
 limit=10,offset=0,
}={}){
 if(!UUID.test(storeId??'')||!exact(input,TOP)||
  input.schema_version!==1||input.store_id!==storeId||
  input.source!=='synthetic_held_review'||
  input.shipping_enabled!==false||
  input.label_purchase_enabled!==false||
  input.tracking_entry_enabled!==false||
  input.delivery_decryption_enabled!==false||
  !integer(limit,20)||limit<1||!integer(offset,1000)||
  input.limit!==limit||input.offset!==offset||
  !integer(input.total,1000000)||
  typeof input.has_more!=='boolean'||
  !Array.isArray(input.orders)||input.orders.length>limit||
  input.has_more!==(offset+input.orders.length<input.total)||
  (offset<input.total&&input.orders.length===0))return null;
 const orders=[],ids=new Set(),references=new Set(),tracking=new Set();
 let prev=null;
 for(const row of input.orders){
  const parsed=parseOrder(row,storeId,tracking);
  if(!parsed||ids.has(parsed.id)||references.has(parsed.reference))
    return null;
  const cursor=parsed.purchasedAt+':'+parsed.id;
  if(prev!==null&&cursor>=prev)return null;
  prev=cursor;
  ids.add(parsed.id);references.add(parsed.reference);
  orders.push(parsed);
 }
 return Object.freeze({
  storeId,total:input.total,limit,offset,
  hasMore:input.has_more,orders:Object.freeze(orders),
  readOnly:true,sourceAuthoritative:false,
  canShip:false,canBuyLabel:false,canEnterTracking:false,
 });
}
