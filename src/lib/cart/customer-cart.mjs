import {previewCheckoutCharges} from "../commerce/checkout-charge-rules.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
export const CUSTOMER_CART_STORAGE_KEY="apex_customer_cart_v1";
export const CART_LIMIT=20;
export const CART_UNITS_LIMIT=50;

export function normalizeCartSelections(value){
 if(!Array.isArray(value)||value.length>CART_LIMIT)return [];
 const ids=new Set();
 const out=[];
 let units=0;
 for(const item of value){
  if(!item||typeof item!=="object"||Array.isArray(item)||
   Object.keys(item).length!==2||typeof item.product_id!=="string"||
   !UUID.test(item.product_id)||ids.has(item.product_id)||
   !Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10)
   return [];
  ids.add(item.product_id);
  units+=item.quantity;
  if(units>CART_UNITS_LIMIT)return [];
  out.push({product_id:item.product_id,quantity:item.quantity});
 }
 return out;
}
export function parseSavedCart(raw){
 if(typeof raw!=="string"||raw.length>1500)return [];
 try{
  const value=JSON.parse(raw);
  if(!value||value.version!==1||!Array.isArray(value.items))return [];
  return normalizeCartSelections(value.items);
 }catch{return [];}
}
export function saveCartPayload(items){
 return JSON.stringify({version:1,items:normalizeCartSelections(items)});
}
export function changeCartItem(items,id,quantity){
 const current=normalizeCartSelections(items);
 if(!UUID.test(id)||!Number.isInteger(quantity)||quantity<0||quantity>10)
  return current;
 const updated=current.filter(item=>item.product_id!==id);
 if(quantity>0)updated.push({product_id:id,quantity});
 const result=normalizeCartSelections(updated);
 return updated.length&&!result.length?current:result;
}
export function cartCount(items){
 return normalizeCartSelections(items).reduce((sum,item)=>sum+item.quantity,0);
}

const exactKeys=(data,keys)=>data&&typeof data==="object"&&
 !Array.isArray(data)&&Object.keys(data).length===keys.length&&
 Object.keys(data).every(key=>keys.includes(key));
function safePromo(p){
 if(p===null)return null;
 if(!exactKeys(p,["code","is_active","discount_kind","discount_value",
  "min_subtotal_cents","starts_at","ends_at","usage_limit","redemption_count"])||
  typeof p.code!=="string"||!/^[A-Z0-9_-]{3,24}$/.test(p.code)||
  typeof p.is_active!=="boolean"||
  !["fixed","percentage","free_shipping"].includes(p.discount_kind)||
  !MONEY(p.discount_value)||p.discount_value===0||
  !MONEY(p.min_subtotal_cents)||!Number.isInteger(p.redemption_count)||
  p.redemption_count<0||
  (p.usage_limit!==null&&(!Number.isInteger(p.usage_limit)||p.usage_limit<1))||
  (p.starts_at!==null&&(typeof p.starts_at!=="string"||
   !Number.isFinite(Date.parse(p.starts_at))))||
  (p.ends_at!==null&&(typeof p.ends_at!=="string"||
   !Number.isFinite(Date.parse(p.ends_at)))))return false;
 return p;
}

// Only recognize an explicitly nonpayable, zero-stock public release source.
// Unknown fields, stale prices, missing items and privileges fail closed.
export function buildCartReview(source,{items,code="",boxSize="small",now=new Date()}){
 const requested=normalizeCartSelections(items);
 if(!requested.length||typeof code!=="string"||
  (code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code))||
  !["small","medium"].includes(boxSize))return {ok:false,reason:"Invalid cart selection"};
 if(!source||typeof source!=="object"||Array.isArray(source)||
   source.schema_version!==1||source.can_place_order!==false||
   source.can_pay!==false)return {ok:false,reason:"Cart verification unavailable"};
 if(source.state==="catalog_unavailable"||source.state==="cart_unavailable")
  return {ok:false,reason:"Catalog items or inventory are currently unavailable"};
 if(!exactKeys(source,["schema_version","state","items","shipping",
   "requested_code","promotion","can_place_order","can_create_invoice",
   "can_reserve_stock","can_pay"])||
  source.state!=="rechecked_sold_out_cart"||
  source.can_create_invoice!==false||source.can_reserve_stock!==false||
  source.requested_code!==code||!Array.isArray(source.items)||
  source.items.length!==requested.length)return {ok:false,reason:"Cart verification unavailable"};
 const shipping=source.shipping;
 if(!exactKeys(shipping,["charge_shipping","flat_shipping_cents",
  "medium_flat_shipping_cents","free_shipping_min_subtotal_cents"])||
  shipping.charge_shipping!==true||!MONEY(shipping.flat_shipping_cents)||
  !MONEY(shipping.medium_flat_shipping_cents)||
  !MONEY(shipping.free_shipping_min_subtotal_cents)||
  shipping.flat_shipping_cents<1||shipping.medium_flat_shipping_cents<shipping.flat_shipping_cents||
  shipping.free_shipping_min_subtotal_cents<1)
  return {ok:false,reason:"Shipping configuration unavailable"};
 const lines=[];
 const names=[];
 for(let index=0;index<requested.length;index++){
  const observed=source.items[index];
  const item=requested[index];
  if(!exactKeys(observed,["product_id","name","unit_price_cents",
   "quantity","availability","can_checkout"])||
   observed.product_id!==item.product_id||observed.quantity!==item.quantity||
   typeof observed.name!=="string"||!observed.name.trim()||
   observed.name.length>120||typeof observed.unit_price_cents!=="string"||
   !/^[1-9][0-9]{0,8}$/.test(observed.unit_price_cents)||
   observed.availability!=="sold_out"||observed.can_checkout!==false)
   return {ok:false,reason:"Product or stock verification failed"};
  lines.push({productId:item.product_id,quantity:item.quantity,
   unitPriceCents:Number(observed.unit_price_cents)});
  names.push(observed.name);
 }
 const promo=safePromo(source.promotion);
 if(promo===false||(code!==""&&promo?.code!==code)||
  (code===""&&promo!==null))
  return {ok:false,reason:"Discount code unavailable"};
 const result=previewCheckoutCharges({lines,shippingPolicy:shipping,
  discountCode:promo,boxSize,now});
 if(!result.ok)return {ok:false,reason:code?"Discount code unavailable":result.reason};
 if(result.canPlaceOrder!==false||result.canPay!==false||
  result.canCreateInvoice!==false||result.quoteFinalized!==false)
  return {ok:false,reason:"Cart verification unavailable"};
 return {
  ok:true,status:"unavailable_stock",canPlaceOrder:false,canPay:false,
  items:lines.map((line,i)=>({productId:line.productId,name:names[i],
   quantity:line.quantity,unitPriceCents:line.unitPriceCents,
   lineTotalCents:line.unitPriceCents*line.quantity,availability:"sold_out"})),
  merchandiseSubtotalCents:result.merchandiseSubtotalCents,
  merchandiseDiscountCents:result.merchandiseDiscountCents,
  discountedMerchandiseCents:result.discountedMerchandiseCents,
  shippingBoxSize:result.shippingBoxSize,
  shippingCents:result.shippingCents,
  freeShippingMinimumCents:result.freeShippingMinimumCents,
  amountUntilFreeShippingCents:result.amountUntilFreeShippingCents,
  freeShippingReason:result.freeShippingReason,totalCents:result.totalCents,
 };
}
