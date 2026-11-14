import {quoteDiscount} from "./discount-quote.mjs";
import {estimateFlatRatePackages} from "./flat-rate-package-estimate.mjs";

// Shipping-only checkout math. Source amounts must come from the server.
// Legacy tier key "small" means the padded envelope; "medium" means the box.
// Keep these stable keys to preserve existing private quote contracts.
const LIMIT=999999999;
const validCents=(value)=>Number.isSafeInteger(value)&&value>=0&&value<=LIMIT;
export function resolveUspsPackage(policy,unitCount,requested="auto"){
 const maximum=policy?.envelope_max_items===undefined?4:policy.envelope_max_items;
 if(!Number.isInteger(maximum)||maximum<1||maximum>50||
  !Number.isInteger(unitCount)||unitCount<1||unitCount>50||
  !["auto","small","medium"].includes(requested))return null;
 // Never downsize when a saved store limit requires Medium.
 return requested==="medium"||unitCount>maximum?"medium":"small";
}

export function quoteOptionalShipping(policy,discountedSubtotalCents,freeShippingCode=false,boxSize="small",unitCount=1){
 const selected=resolveUspsPackage(policy,unitCount,boxSize);
 if(!validCents(discountedSubtotalCents)||typeof freeShippingCode!=="boolean"||
   selected===null||
   !policy||typeof policy!=="object"||typeof policy.charge_shipping!=="boolean"||
   !validCents(policy.flat_shipping_cents)||
   (policy.medium_flat_shipping_cents!==undefined&&
    !validCents(policy.medium_flat_shipping_cents))||
   (policy.charge_shipping&&selected==="medium"&&
    (!validCents(policy.medium_flat_shipping_cents)||
      policy.medium_flat_shipping_cents===0))||
   (policy.free_shipping_min_subtotal_cents!==null &&
    (policy.free_shipping_min_subtotal_cents===undefined||
     !Number.isSafeInteger(policy.free_shipping_min_subtotal_cents)||
     policy.free_shipping_min_subtotal_cents<1||
     policy.free_shipping_min_subtotal_cents>LIMIT))||
   (!policy.charge_shipping&&(policy.flat_shipping_cents!==0||
     (policy.medium_flat_shipping_cents??0)!==0||
     policy.free_shipping_min_subtotal_cents!==null)))
  return null;
 const original=!policy.charge_shipping?0:selected==="medium"?
  policy.medium_flat_shipping_cents:policy.flat_shipping_cents;
 const minimum=policy.charge_shipping?
   policy.free_shipping_min_subtotal_cents:null;
 const amountUntilFreeShippingCents=minimum===null?null:
   Math.max(0,minimum-discountedSubtotalCents);
 const thresholdMet=minimum!==null&&amountUntilFreeShippingCents===0;
 const fee=(thresholdMet||freeShippingCode)?0:original;
 return Object.freeze({
  shippingBoxSize:selected,
  envelopeMaxItems:policy.envelope_max_items??4,
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
 lines,shippingPolicy,discountCode=null,now=new Date(),boxSize="small",shippingProfiles=undefined,
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
 let shipping=quoteOptionalShipping(shippingPolicy,
  discountedMerchandiseCents,promo?.freeShipping===true,boxSize,units);
 if(!shipping)return fail("Shipping configuration unavailable");
 if(shippingProfiles!==undefined){
  const plan=estimateFlatRatePackages(lines,shippingProfiles,shippingPolicy);
  if(!plan.ok&&plan.reason!=="missing_profiles")
   return fail(plan.reason==="oversize"
    ?"An item needs a different shipping package. Ask the supplier to review its dimensions."
    :"Invalid product shipping measurements.");
  if(plan.ok){
   const originalShippingCents=shippingPolicy.charge_shipping?
    plan.originalShippingCents:0;
   const shippingFree=!shippingPolicy.charge_shipping||
    promo?.freeShipping===true||
    shipping.freeShippingReason==="subtotal_threshold";
   const shippingCents=shippingFree?0:originalShippingCents;
   shipping={...shipping,
    shippingBoxSize:plan.shippingBoxSize,
    originalShippingCents,shippingCents,
    shippingDiscountCents:originalShippingCents-shippingCents,
    shippingPackages:plan.shippingPackages,
    packageCount:plan.packageCount,
    shippingEstimateStatus:"dimensional_estimate"};
  }else{
   // Existing unmapped products retain only the clearly marked legacy
   // quantity-based quote. No checkout route may trust this as a final rate.
   shipping={...shipping,shippingPackages:[],packageCount:null,
    shippingEstimateStatus:"provisional_missing_dimensions"};
  }
 }
 const totalCents=discountedMerchandiseCents+shipping.shippingCents;
 if(!validCents(totalCents))return fail("Total exceeds limit");
 return Object.freeze({
  ok:true,reason:"",currency:"USD",
  merchandiseSubtotalCents,merchandiseDiscountCents,
  discountedMerchandiseCents,...shipping,
  shippingBoxSize:shipping.shippingBoxSize??"medium",totalCents,
  // This is an informational total only, not order admission.
  canPlaceOrder:false,canCreateInvoice:false,canPay:false,
  quoteFinalized:false,
 });
}
