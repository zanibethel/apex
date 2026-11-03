import {previewCheckoutCharges,quoteOptionalShipping} from "../commerce/checkout-charge-rules.mjs";

// Fail-closed parser for a private, read-only, server-priced shipping quote.
// The merchant handles any applicable obligations outside this calculator.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
const allowedPromo=["percentage","fixed","free_shipping"];
function parsePromotion(p){
 if(!p||typeof p!=="object"||!/^[A-Z0-9_-]{3,24}$/.test(p.code)||
  !allowedPromo.includes(p.discount_kind)||
  typeof p.is_active!=="boolean"||
  !Number.isInteger(p.discount_value)||p.discount_value<1||
  p.discount_value>999999999||!MONEY(p.min_subtotal_cents)||
  (p.usage_limit!==null&&(!Number.isInteger(p.usage_limit)||p.usage_limit<1))||
  !Number.isInteger(p.redemption_count)||p.redemption_count<0||
  (p.starts_at!==null&&(typeof p.starts_at!=="string"||
   !Number.isFinite(Date.parse(p.starts_at))))||
  (p.ends_at!==null&&(typeof p.ends_at!=="string"||
   !Number.isFinite(Date.parse(p.ends_at)))))return null;
 if(p.discount_kind==="percentage"&&p.discount_value>95)return null;
 if(p.discount_kind==="free_shipping"&&p.discount_value!==1)return null;
 return p;
}
export function parsePrivateDestinationChargeSource(
 data,{storeId,productId,quantity,code}
){
 if(!data||typeof data!=="object"||!UUID.test(storeId)||
  !UUID.test(productId)||!Number.isInteger(quantity)||
  quantity<1||quantity>10||
  data.schema_version!==2||data.state!=="private_shipping_charge_source"||
  data.store_id!==storeId||data.product_id!==productId||
  data.quantity!==quantity||data.currency!=="USD"||
  !MONEY(data.unit_price_cents)||data.unit_price_cents===0||
  !MONEY(data.observed_subtotal_cents)||
  data.observed_subtotal_cents!==data.unit_price_cents*quantity||
  typeof data.name!=="string"||!data.name.trim()||
  data.name.length>120||
  (data.quantity_available!==null&&
   (!Number.isInteger(data.quantity_available)||data.quantity_available<0))||
  data.requested_code!==code||typeof data.promotion_found!=="boolean"||
  data.can_create_order!==false||data.can_create_invoice!==false||
  data.can_reserve_stock!==false||data.can_pay!==false||
  data.checkout_enabled!==false||
  !data.shipping||typeof data.shipping!=="object"||
  Object.hasOwn(data,"collect_sales_tax")||
  Object.hasOwn(data,"tax_cents")||
  Object.hasOwn(data,"tax_source"))
  return null;
 if(!quoteOptionalShipping(data.shipping,data.observed_subtotal_cents,false))
  return null;
 if(code===""&&(data.promotion_found||data.promotion!==null))return null;
 if(code!==""&&data.promotion_found!==Boolean(data.promotion))return null;
 if(data.promotion_found&&
  (data.promotion.code!==code||!parsePromotion(data.promotion)))return null;
 return {
  name:data.name,productId,quantity,unitPriceCents:data.unit_price_cents,
  observedSubtotalCents:data.observed_subtotal_cents,
  availableUnits:data.quantity_available,shippingPolicy:data.shipping,
  promotion:data.promotion_found?data.promotion:null,
  codeFound:code===""?true:data.promotion_found,
 };
}
export function estimatePrivateDestinationCharges(
 parsed,{code,expectedSubtotalCents,now=new Date()}
){
 if(!parsed||!MONEY(expectedSubtotalCents)||
  typeof code!=="string")return null;
 if(code!==""&&!parsed.codeFound)
  return {ok:false,message:"Promotion code not found for this private store."};
 const estimated=previewCheckoutCharges({
  lines:[{productId:parsed.productId,quantity:parsed.quantity,
   unitPriceCents:parsed.unitPriceCents}],
  shippingPolicy:parsed.shippingPolicy,
  discountCode:parsed.promotion,now,
 });
 if(!estimated.ok)return {ok:false,message:estimated.reason};
 if(estimated.canPlaceOrder!==false||estimated.canCreateInvoice!==false||
  estimated.canPay!==false||estimated.quoteFinalized!==false)return null;
 return {
  ok:true,message:"Saved merchandise prices, discount and shipping rules verified.",
  name:parsed.name,quantity:parsed.quantity,
  expectedSubtotalCents,
  subtotalMatchesDisplay:parsed.observedSubtotalCents===expectedSubtotalCents,
  availableUnits:parsed.availableUnits,
  merchandiseSubtotalCents:estimated.merchandiseSubtotalCents,
  merchandiseDiscountCents:estimated.merchandiseDiscountCents,
  discountedMerchandiseCents:estimated.discountedMerchandiseCents,
  originalShippingCents:estimated.originalShippingCents,
  shippingCents:estimated.shippingCents,
  shippingDiscountCents:estimated.shippingDiscountCents,
  freeShippingMinimumCents:estimated.freeShippingMinimumCents,
  amountUntilFreeShippingCents:estimated.amountUntilFreeShippingCents,
  freeShippingReason:estimated.freeShippingReason,
  totalCents:estimated.totalCents,
  quoteFinalized:false,canCreateOrder:false,canCreateInvoice:false,
  canPay:false,
 };
}
