// Apex supplier-held single-order metadata, never a fulfillment grant.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const KEYS=[
 "schema_version","source","store_id","order_id",
 "original_reference","purchased_at_utc","recorded_sale_state",
 "stored_line_count","destination_sealed","source_history_matched",
 "held_only","payment_enabled","shipping_enabled",
 "delivery_decryption_enabled",
];
const STATUSES=new Set(["confirmed","pending","refunded","cancelled"]);
export function isSupplierOrderId(id){
 return typeof id==="string"&&UUID.test(id);
}
export function parseSupplierHeldOrderRecord(input,storeId,orderId){
 if(!isSupplierOrderId(storeId)||!isSupplierOrderId(orderId)||
  !input||typeof input!=="object"||Array.isArray(input)||
  Object.keys(input).length!==KEYS.length||
  !KEYS.every(k=>Object.hasOwn(input,k))||
  input.schema_version!==1||input.source!=="original_held_order_record"||
  input.store_id!==storeId||input.order_id!==orderId||
  typeof input.original_reference!=="string"||
  input.original_reference.trim()!==input.original_reference||
  input.original_reference.length<1||input.original_reference.length>200||
  /[\x00-\x1f\x7f]/.test(input.original_reference)||
  typeof input.purchased_at_utc!=="string"||
  !UTC.test(input.purchased_at_utc)||
  !Number.isFinite(Date.parse(input.purchased_at_utc))||
  new Date(input.purchased_at_utc).toISOString()!==input.purchased_at_utc||
  !STATUSES.has(input.recorded_sale_state)||
  !Number.isSafeInteger(input.stored_line_count)||
  input.stored_line_count<0||input.stored_line_count>50||
  typeof input.destination_sealed!=="boolean"||
  input.source_history_matched!==true||
  input.held_only!==true||input.payment_enabled!==false||
  input.shipping_enabled!==false||
  input.delivery_decryption_enabled!==false)return null;
 return Object.freeze({
  id:orderId,storeId,
  reference:input.original_reference,purchasedAt:input.purchased_at_utc,
  recordedSaleState:input.recorded_sale_state,
  storedLineCount:input.stored_line_count,
  destinationSealed:input.destination_sealed,
  sourceHistoryMatched:true,
  status:"held_unverified",canShip:false,canPay:false,
  canViewDelivery:false,canPurchaseLabel:false,canUpdateTracking:false,
 });
}
export function supplierHeldOrderHref(storeId,orderId){
 if(!isSupplierOrderId(storeId)||!isSupplierOrderId(orderId))return null;
 return "/supplier/orders/"+encodeURIComponent(orderId)+
  "?store="+encodeURIComponent(storeId);
}
