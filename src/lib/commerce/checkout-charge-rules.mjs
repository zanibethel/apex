import {quoteDiscount} from "./discount-quote.mjs";

// Shipping-only checkout math. Source amounts must come from the server.
const LIMIT=999999999;
const validCents=(value)=>Number.isSafeInteger(value)&&value>=0&&value<=LIMIT;

export function quoteOptionalShipping(policy,discountedSubtotalCents,freeShippingCode=false){
 if(!validCents(discountedSubtotalCents)||typeof freeShippingCode!=="boolean"||
   !policy||typeof policy!=="object"||typeof policy.charge_shipping!=="boolean"||
   !validCents(policy.flat_shipping_cents)||
   (policy.free_shipping_min_subtotal_cents!==null &&
    (policy.free_shipping_min_subtotal_cents===undefined||
     !Number.isSafeInteger(policy.free_shipping_min_subtotal_cents)||
     policy.free_shipping_min_subtotal_cents<1||
     policy.free_shipping_min_subtotal_cents>LIMIT))||
   (!policy.charge_shipping&&(policy.flat_shipping_cents!==0||
     policy.free_shipping_min_subtotal_cents!==null)))
  return null;
 const original=policy.charge_shipping?policy.flat_shipping_cents:0;
 const minimum=policy.charge_shipping?
   policy.free_shipping_min_subtotal_cents:null;
 const amountUntilFreeShippingCents=minimum===null?null:
   Math.max(0,minimum-discountedSubtotalCents);
 const thresholdMet=minimum!==null&&amountUntilFreeShippingCents===0;
 const fee=(thresholdMet||freeShippingCode)?0:original;
 return Object.freeze({
  originalShippingCents:original,
  shippingCents:fee,
  shippingDiscountCents:original-fee,
  freeShippingMinimumCents:minimum,
  amountUntilFreeShippingCents,
  freeShippingReason:original===0?"no_charge":
    freeShippingCode?"discount_code":thresholdMet?"subtotal_threshold":"none",
 });
}

// Shipping-only charge calculation for the private Apex checkout preview.
// Prices, quantities, shipping settings and promotions MUST be read from the
// database on the server. No tax service is contacted in this flow.
export function previewCheckoutCharges({
 lines,shippingPolicy,discountCode=null,now=new Date(),
}){
 const fail=(reason)=>Object.freeze({ok:false,reason,canPlaceOrder:false,
  canCreateInvoice:false,canPay:false});
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)
  return fail("Invalid line items");
 const seen=new Set();
 let merchandiseSubtotalCents=0,units=0;
 for(const line of lines){
  if(!line||typeof line!=="object"||typeof line.productId!=="string"||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(line.productId)||
   seen.has(line.productId)||
   !Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10||
   !validCents(line.unitPriceCents)||line.unitPriceCents===0)
   return fail("Invalid product or quantity");
  seen.add(line.productId);
  units+=line.quantity;
  const amount=line.unitPriceCents*line.quantity;
  if(!Number.isSafeInteger(amount)||amount>LIMIT||
   merchandiseSubtotalCents+amount>LIMIT)
   return fail("Merchandise subtotal exceeds limit");
  merchandiseSubtotalCents+=amount;
 }
 if(units>50)return fail("Too many units");
 const promo=discountCode===null?null:quoteDiscount(
  discountCode,merchandiseSubtotalCents,now);
 if(promo&&!promo.eligible)return fail(promo.reason);
 const merchandiseDiscountCents=promo?.discountCents??0;
 const discountedMerchandiseCents=merchandiseSubtotalCents-
  merchandiseDiscountCents;
 const shipping=quoteOptionalShipping(shippingPolicy,
  discountedMerchandiseCents,promo?.freeShipping===true);
 if(!shipping)return fail("Shipping configuration unavailable");
 const totalCents=discountedMerchandiseCents+shipping.shippingCents;
 if(!validCents(totalCents))return fail("Total exceeds limit");
 return Object.freeze({
  ok:true,reason:"",currency:"USD",
  merchandiseSubtotalCents,merchandiseDiscountCents,
  discountedMerchandiseCents,...shipping,totalCents,
  // This is an informational total only, not order admission.
  canPlaceOrder:false,canCreateInvoice:false,canPay:false,
  quoteFinalized:false,
 });
}
