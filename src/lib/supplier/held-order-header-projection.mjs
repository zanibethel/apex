/**
 * Strict allowlisted projection of immutable supplier-held order HEADERS.
 * No item names, prices, contact information, fulfillment or payment data.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOP=['schema_version','store_id','source','limit','offset','total',
 'has_more','orders','held_only','source_attested','payment_enabled',
 'shipping_enabled','delivery_decryption_enabled'];
const ROW=['order_id','original_reference','purchased_at_utc',
 'recorded_sale_state','stored_line_count','destination_sealed',
 'status','can_pay','can_ship','can_decrypt'];
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const text=s=>typeof s==='string'&&s.length>=1&&s.length<=200&&
 s.trim()===s&&!/[\x00-\x1f\x7f]/.test(s);
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;
const STATES=new Set(['pending','confirmed','refunded','cancelled']);
export function parseSupplierHeldOrderHeaders(input,storeId,{limit=25,offset=0}={}){
 if(!UUID.test(storeId??'')||!exact(input,TOP)||input.schema_version!==1||
  input.store_id!==storeId||input.source!=='original_held_order_headers'||
  !Number.isInteger(limit)||limit<1||limit>25||
  !Number.isInteger(offset)||offset<0||offset>1000||
  input.limit!==limit||input.offset!==offset||!count(input.total)||
  typeof input.has_more!=='boolean'||!Array.isArray(input.orders)||
  input.orders.length>limit||
  input.has_more!==(offset+input.orders.length<input.total)||
  (offset<input.total&&input.orders.length===0)||
  input.held_only!==true||input.source_attested!==false||
  input.payment_enabled!==false||input.shipping_enabled!==false||
  input.delivery_decryption_enabled!==false)return null;
 const rows=[],seen=new Set();let previous=null;
 for(const row of input.orders){
  if(!exact(row,ROW)||!UUID.test(row.order_id??'')||
   !text(row.original_reference)||!UTC.test(row.purchased_at_utc??'')||
   !Number.isFinite(Date.parse(row.purchased_at_utc))||
   new Date(row.purchased_at_utc).toISOString()!==row.purchased_at_utc||
   !STATES.has(row.recorded_sale_state)||!count(row.stored_line_count)||
   row.stored_line_count>50||typeof row.destination_sealed!=='boolean'||
   row.status!=='held_unverified'||
   row.can_pay!==false||row.can_ship!==false||row.can_decrypt!==false||
   seen.has(row.order_id))return null;
  const cursor=row.purchased_at_utc+':'+row.order_id;
  if(previous!==null&&cursor>=previous)return null;
  previous=cursor;seen.add(row.order_id);
  rows.push(Object.freeze({
   id:row.order_id,reference:row.original_reference,
   purchasedAt:row.purchased_at_utc,
   recordedSaleState:row.recorded_sale_state,
   storedLineCount:row.stored_line_count,
   destinationSealed:row.destination_sealed,
   status:'held_unverified',canShip:false,canPay:false,
  }));
 }
 return Object.freeze({storeId,total:input.total,limit,offset,
  hasMore:input.has_more,orders:Object.freeze(rows),
  sourceAttested:false,canShip:false,canPay:false});
}
