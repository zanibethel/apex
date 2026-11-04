/**
 * Issue #214 Phase 8: strict read-only projection boundary for supplier UI.
 * The only accepted source is the membership-checked private DB RPC.
 * Fail closed rather than displaying partial rows, recipient data, hashes,
 * keys, or treating recorded sale state as shipping authorization.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DEC=/^(?:0|[1-9]\d{0,11})$/;
const STATES=new Set(['pending','confirmed','refunded','cancelled']);
const TOP=['schema_version','store_id','source','total','offset','limit',
 'has_more','orders','detail_status','shipping_enabled','payment_enabled',
 'delivery_decryption_enabled'];
const ROW=['order_id','order_reference','purchased_at_utc',
 'recorded_sale_state','display_status','destination_sealed','lines',
 'subtotal_cents','shipping_cents','discount_cents','gross_cents',
 'can_ship','can_pay','can_decrypt'];
const LINE=['line_number','sku','title','variant','quantity',
 'unit_price_cents','line_total_cents'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
const bounded=(s,min,max)=>typeof s==='string'&&s.length>=min&&
 s.length<=max&&s.trim()===s&&!/[\u0000-\u001f\u007f]/.test(s);
const cents=s=>typeof s==='string'&&DEC.test(s)&&
 Number.isSafeInteger(Number(s))&&Number(s)<=500000000000;
function asRow(row,storeId){
 if(!exact(row,ROW)||!UUID.test(row.order_id??'')||
    !bounded(row.order_reference,1,200)||
    typeof row.purchased_at_utc!=='string'||
    !UTC.test(row.purchased_at_utc)||
    !Number.isFinite(Date.parse(row.purchased_at_utc))||
    new Date(row.purchased_at_utc).toISOString()!==row.purchased_at_utc||
    !STATES.has(row.recorded_sale_state)||
    row.can_ship!==false||row.can_pay!==false||
    row.can_decrypt!==false||!Array.isArray(row.lines))
    return null;
 if(row.display_status==='incomplete_held_record'){
  if(row.destination_sealed!==false||row.lines.length!==0||
   row.subtotal_cents!==null||row.shipping_cents!==null||
   row.discount_cents!==null||row.gross_cents!==null)return null;
  return Object.freeze({
   id:row.order_id,storeId,reference:row.order_reference,
   purchasedAt:row.purchased_at_utc,recordedSaleState:row.recorded_sale_state,
   readiness:'incomplete',lines:Object.freeze([]),
   totals:null,destinationProtected:false,canShip:false,canPay:false,
  });
 }
 if(row.display_status!=='held_unverified'||
    row.destination_sealed!==true||
    row.lines.length<1||row.lines.length>50||
    ![row.subtotal_cents,row.shipping_cents,row.discount_cents,
      row.gross_cents].every(cents))return null;
 let sum=0;
 const lines=[];
 for(let i=0;i<row.lines.length;i++){
  const l=row.lines[i];
  if(!exact(l,LINE)||l.line_number!==i+1||
   !bounded(l.sku,1,160)||!bounded(l.title,1,240)||
   !bounded(l.variant,0,140)||
   !Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>100||
   !cents(l.unit_price_cents)||Number(l.unit_price_cents)>99999999||
   !cents(l.line_total_cents)||
   Number(l.line_total_cents)!==l.quantity*Number(l.unit_price_cents))
   return null;
  sum+=Number(l.line_total_cents);
  if(!Number.isSafeInteger(sum))return null;
  lines.push(Object.freeze({
   number:l.line_number,sku:l.sku,title:l.title,variant:l.variant,
   quantity:l.quantity,unitPriceCents:Number(l.unit_price_cents),
   totalCents:Number(l.line_total_cents),
  }));
 }
 const shipping=Number(row.shipping_cents);
 const discount=Number(row.discount_cents);
 const gross=Number(row.gross_cents);
 if(sum!==Number(row.subtotal_cents)||discount>sum+shipping||
    sum+shipping-discount!==gross)return null;
 return Object.freeze({
  id:row.order_id,storeId,reference:row.order_reference,
  purchasedAt:row.purchased_at_utc,
  recordedSaleState:row.recorded_sale_state,
  readiness:'held',lines:Object.freeze(lines),
  totals:Object.freeze({subtotalCents:sum,shippingCents:shipping,
   discountCents:discount,grossCents:gross}),
  destinationProtected:true,canShip:false,canPay:false,
 });
}
/**
 * Returns null on any unrecognized key or unsafe shape; never salvages partial
 * data because that could inadvertently display a different store's order.
 */
export function parseSupplierHeldOrderDetails(input,storeId,{limit=25,offset=0}={}){
 if(!UUID.test(storeId??'')||!exact(input,TOP)||
   input.schema_version!==1||input.store_id!==storeId||
   input.source!=='private_held_order_snapshots'||
   input.detail_status!=='held_unverified'||
   input.shipping_enabled!==false||
   input.payment_enabled!==false||
   input.delivery_decryption_enabled!==false||
   !Number.isSafeInteger(limit)||limit<1||limit>50||
   !Number.isSafeInteger(offset)||offset<0||offset>1000||
   input.limit!==limit||input.offset!==offset||
   !Number.isSafeInteger(input.total)||input.total<0||
   input.total>1000000||typeof input.has_more!=='boolean'||
   !Array.isArray(input.orders)||input.orders.length>limit||
   input.has_more!==(offset+input.orders.length<input.total)||
   (offset<input.total&&input.orders.length===0))
   return null;
 const seen=new Set();
 const records=[];
 let previous=null;
 for(const row of input.orders){
  const parsed=asRow(row,storeId);
  if(!parsed||seen.has(parsed.id))return null;
  const cursor=parsed.purchasedAt+':'+parsed.id;
  // Original purchase UTC descending, breaking ties by canonical order id.
  if(previous!==null&&cursor>=previous)return null;
  previous=cursor;
  seen.add(parsed.id);records.push(parsed);
 }
 return Object.freeze({
  storeId,total:input.total,limit,offset,hasMore:input.has_more,
  orders:Object.freeze(records),canShip:false,canPay:false,
  canDecrypt:false,sourceAuthoritative:false,
 });
}
