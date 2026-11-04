const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const FIELDS=[
 "schema_version","store_id","order_snapshots","line_snapshots",
 "sealed_destinations","source","order_ingest_enabled",
 "delivery_decryption_enabled","shipping_enabled","payment_enabled",
 "detail_status",
];
export function parseSupplierOrderDetailFoundation(input,storeId){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  !UUID.test(storeId)||
  Object.keys(input).sort().join(",")!==[...FIELDS].sort().join(",")||
  input.schema_version!==1||input.store_id!==storeId||
  !["order_snapshots","line_snapshots","sealed_destinations"].every(
   k=>Number.isSafeInteger(input[k])&&input[k]>=0
  )||
  input.sealed_destinations>input.order_snapshots||
  input.source!=="verified_sales_history"||
  input.order_ingest_enabled!==false||
  input.delivery_decryption_enabled!==false||
  input.shipping_enabled!==false||input.payment_enabled!==false||
  input.detail_status!=="held_unverified"
 )return null;
 return Object.freeze({
  orders:input.order_snapshots,
  lines:input.line_snapshots,
  destinationsSealed:input.sealed_destinations,
  canImportOrders:false,canShip:false,canCollectPayments:false,
 });
}
