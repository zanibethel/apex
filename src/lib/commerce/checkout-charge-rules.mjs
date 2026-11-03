import {quoteDiscount} from "./discount-quote.mjs";

// Private checkout calculation contract. Input must come from authorized,
// server-read product and promotion records, never a customer-supplied total.
// Taxes require independent, destination-specific evidence; we never guess a
// rate or claim "tax exempt" based on the checkbox alone.
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
 const thresholdMet=policy.charge_shipping&&
   policy.free_shipping_min_subtotal_cents!==null&&
   discountedSubtotalCents>=policy.free_shipping_min_subtotal_cents;
 const fee=(thresholdMet||freeShippingCode)?0:original;
 return Object.freeze({
  originalShippingCents:original,
  shippingCents:fee,
  shippingDiscountCents:original-fee,
  freeShippingReason:original===0?"no_charge":
    freeShippingCode?"discount_code":thresholdMet?"subtotal_threshold":"none",
 });
}

export function previewCheckoutCharges({
 lines,shippingPolicy,discountCode=null,
 // A genuine future checkout must use a verified jurisdiction + product +
 // shipping tax quote. This preview intentionally has no total tax amount.
 now=new Date(),
}){
 const fail=(reason)=>Object.freeze({ok:false,reason,canPlaceOrder:false});
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)return fail("Invalid line items");
 const seen=new Set();
 let gross=0,taxableGross=0,totalUnits=0;
 for(const l of lines){
  if(!l||typeof l!=="object"||typeof l.productId!=="string"||
    !/^[0-9a-f-]{36}$/i.test(l.productId)||seen.has(l.productId)||
    !Number.isInteger(l.quantity)||l.quantity<1||l.quantity>10||
    !validCents(l.unitPriceCents)||l.unitPriceCents===0||
    typeof l.collectSalesTax!=="boolean")
   return fail("Invalid product or tax collection configuration");
  seen.add(l.productId);totalUnits+=l.quantity;
  const amount=l.unitPriceCents*l.quantity;
  if(!Number.isSafeInteger(amount)||amount>LIMIT||gross+amount>LIMIT)
   return fail("Subtotal exceeds limit");
  gross+=amount;
  if(l.collectSalesTax)taxableGross+=amount;
 }
 if(totalUnits>50)return fail("Too many units");
 const discount=discountCode===null?null:quoteDiscount(discountCode,gross,now);
 if(discount&&!discount.eligible)return fail(discount.reason);
 const merchandiseDiscountCents=discount?.discountCents??0;
 const discountedMerchandiseCents=gross-merchandiseDiscountCents;
 // Item-order-independent proportional allocation. The remainder is
 // assigned to non-taxable lines; for real taxation a jurisdiction-specific
 // provider must determine exact line-level discount allocations.
 const preliminaryTaxableCents=taxableGross===0?0:
  Math.max(0,taxableGross-Math.round(
   merchandiseDiscountCents*taxableGross/gross));
 const shipping=quoteOptionalShipping(
  shippingPolicy,discountedMerchandiseCents,
  discount?.freeShipping===true,
 );
 if(!shipping)return fail("Shipping configuration unavailable");
 const preTaxTotal=discountedMerchandiseCents+shipping.shippingCents;
 if(!validCents(preTaxTotal))return fail("Order amount exceeds limit");
 return Object.freeze({
  ok:true,reason:"",currency:"USD",
  merchandiseSubtotalCents:gross,
  merchandiseDiscountCents,
  discountedMerchandiseCents,
  taxableMerchandiseCents:preliminaryTaxableCents,
  untaxedMerchandiseCents:discountedMerchandiseCents-preliminaryTaxableCents,
  ...shipping,
  preTaxTotalCents:preTaxTotal,
  taxCents:null,
  totalCents:null,
  taxVerificationRequired:true,
  canPlaceOrder:false,canCreateInvoice:false,
 });
}
