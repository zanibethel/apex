/**
 * Versioned supplier-only original line snapshots.
 * Original item descriptions are NOT a grant to fulfill, ship or collect pay.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TOP=[
 "schema_version","source","store_id","order_id","line_count","lines",
 "held_only","product_eligibility_verified","payment_verified",
 "shipping_enabled","delivery_decryption_enabled",
];
const LINE=[
 "line_id","line_number","sku_at_purchase","title_at_purchase",
 "variant_at_purchase","quantity","unit_price_cents",
 "line_subtotal_cents","currency","status","shipping_authorized",
];
const exact=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const cleanText=(x,max,min=0)=>typeof x==="string"&&
 x.length>=min&&x.length<=max&&x.trim()===x&&
 !/[\x00-\x1f\x7f]/.test(x);
const cents=x=>typeof x==="string"&&/^(0|[1-9]\d{0,12})$/.test(x)&&
 Number.isSafeInteger(Number(x));
export function parseSupplierHeldOrderLines(input,storeId,orderId,expectedCount){
 if(typeof storeId!=="string"||!UUID.test(storeId)||
  typeof orderId!=="string"||!UUID.test(orderId)||
  !Number.isSafeInteger(expectedCount)||expectedCount<0||expectedCount>50||
  !exact(input,TOP)||input.schema_version!==1||
  input.source!=="original_held_order_line_snapshots"||
  input.store_id!==storeId||input.order_id!==orderId||
  input.line_count!==expectedCount||
  !Array.isArray(input.lines)||input.lines.length!==expectedCount||
  input.held_only!==true||
  input.product_eligibility_verified!==false||
  input.payment_verified!==false||
  input.shipping_enabled!==false||
  input.delivery_decryption_enabled!==false)return null;
 const ids=new Set(),positions=new Set(),lines=[];
 let previous=0;
 for(const row of input.lines){
  if(!exact(row,LINE)||
   typeof row.line_id!=="string"||!UUID.test(row.line_id)||
   ids.has(row.line_id)||
   !Number.isSafeInteger(row.line_number)||row.line_number<1||
   row.line_number>50||positions.has(row.line_number)||
   row.line_number<=previous||
   !cleanText(row.sku_at_purchase,160,1)||
   !cleanText(row.title_at_purchase,240,1)||
   !cleanText(row.variant_at_purchase,140)||
   !Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>100||
   !cents(row.unit_price_cents)||!cents(row.line_subtotal_cents)||
   Number(row.unit_price_cents)>99999999||
   Number(row.line_subtotal_cents)!==row.quantity*Number(row.unit_price_cents)||
   row.currency!=="USD"||row.status!=="held_unverified"||
   row.shipping_authorized!==false)return null;
  previous=row.line_number;ids.add(row.line_id);positions.add(row.line_number);
  lines.push(Object.freeze({
   id:row.line_id,lineNumber:row.line_number,
   sku:row.sku_at_purchase,title:row.title_at_purchase,
   variant:row.variant_at_purchase,quantity:row.quantity,
   unitPriceCents:Number(row.unit_price_cents),
   subtotalCents:Number(row.line_subtotal_cents),
   currency:"USD",canShip:false,canReserve:false,
  }));
 }
 return Object.freeze({
  storeId,orderId,lineCount:lines.length,
  lines:Object.freeze(lines),heldOnly:true,
  canShip:false,canPay:false,canViewDelivery:false,
  canPurchaseLabel:false,canUpdateTracking:false,
 });
}
