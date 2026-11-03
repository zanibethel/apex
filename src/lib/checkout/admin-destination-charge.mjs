import {previewCheckoutCharges,quoteOptionalShipping} from "../commerce/checkout-charge-rules.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=new Set(("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD "+
 "MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX "+
 "UT VT VA WA WV WI WY DC").split(" "));
const MONEY=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
const bool=n=>typeof n==="boolean";
const STRICT=false;
export function normalizeReviewDestination(state,postal){
 if(typeof state!=="string"||typeof postal!=="string")return null;
 const region=state.trim().toUpperCase();
 const zip=postal.trim();
 if(!STATES.has(region)||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(zip))return null;
 // Valid syntax is NOT a verified jurisdiction. Only a trusted external
 // tax service can confirm ZIP↔state, nexus and shipping taxability.
 return {region,postalCode:zip,jurisdictionVerified:false};
}
function parsePromotion(p){
 if(!p||typeof p!=="object"||!/^[A-Z0-9_-]{3,24}$/.test(p.code)||
  !["percentage","fixed","free_shipping"].includes(p.discount_kind)||
  !bool(p.is_active)||!Number.isInteger(p.discount_value)||
  p.discount_value<1||p.discount_value>999999999||
  !MONEY(p.min_subtotal_cents)||
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
 if(!data||typeof data!=="object"||!UUID.test(storeId)||!UUID.test(productId)||
  data.schema_version!==1||data.state!=="private_destination_charge_source"||
  data.store_id!==storeId||data.product_id!==productId||
  data.quantity!==quantity||data.currency!=="USD"||
  !MONEY(data.unit_price_cents)||data.unit_price_cents===0||
  !MONEY(data.observed_subtotal_cents)||
  data.observed_subtotal_cents!==data.unit_price_cents*quantity||
  !bool(data.collect_sales_tax)||typeof data.name!=="string"||
  !data.name.trim()||data.name.length>120||
  (data.quantity_available!==null&&
   (!Number.isInteger(data.quantity_available)||data.quantity_available<0))||
  data.requested_code!==code||!bool(data.promotion_found)||
  data.tax_source!=="not_configured"||data.tax_cents!==null||
  data.total_cents!==null||data.can_quote_final_total!==STRICT||
  data.can_create_order!==STRICT||data.can_create_invoice!==STRICT||
  data.can_reserve_stock!==STRICT||data.can_pay!==STRICT||
  data.checkout_enabled!==STRICT||
  !data.shipping||typeof data.shipping!=="object")return null;
 if(!quoteOptionalShipping(data.shipping,data.observed_subtotal_cents,false))
  return null;
 if(code===""&&(data.promotion_found||data.promotion!==null))return null;
 if(code!==""&&data.promotion_found!==Boolean(data.promotion))return null;
 if(data.promotion_found&&
  (data.promotion.code!==code||!parsePromotion(data.promotion)))return null;
 return {
  name:data.name,productId,quantity,unitPriceCents:data.unit_price_cents,
  observedSubtotalCents:data.observed_subtotal_cents,
  collectSalesTax:data.collect_sales_tax,
  availableUnits:data.quantity_available,
  shippingPolicy:data.shipping,
  promotion:data.promotion_found?data.promotion:null,
  codeFound:code===""?true:data.promotion_found,
 };
}
export function estimatePrivateDestinationCharges(
 parsed,{destination,code,expectedSubtotalCents,now=new Date()}
){
 if(!parsed||!destination||!STATES.has(destination.region)||
  typeof destination.postalCode!=="string"||
  !/^[0-9]{5}(?:-[0-9]{4})?$/.test(destination.postalCode)||
  destination.jurisdictionVerified!==false||
  !MONEY(expectedSubtotalCents)||typeof code!=="string")return null;
 if(code!==""&&!parsed.codeFound)return {
  ok:false,message:"Promotion code not found for this private store.",
 };
 const estimate=previewCheckoutCharges({
  lines:[{productId:parsed.productId,
   quantity:parsed.quantity,unitPriceCents:parsed.unitPriceCents,
   collectSalesTax:parsed.collectSalesTax}],
  shippingPolicy:parsed.shippingPolicy,
  discountCode:parsed.promotion,
  now,
 });
 if(!estimate.ok)return {ok:false,message:estimate.reason};
 if(estimate.taxCents!==null||estimate.totalCents!==null||
  estimate.canPlaceOrder!==false||estimate.canCreateInvoice!==false)return null;
 return {
  ok:true,message:"Saved product, shipping and promotion checked against the database. A verified destination tax quote is still required.",
  name:parsed.name,quantity:parsed.quantity,
  expectedSubtotalCents,subtotalMatchesDisplay:
    parsed.observedSubtotalCents===expectedSubtotalCents,
  availableUnits:parsed.availableUnits,
  collectSalesTax:parsed.collectSalesTax,
  destinationRegion:destination.region,
  destinationPostal:destination.postalCode,
  destinationVerified:false,
  merchandiseSubtotalCents:estimate.merchandiseSubtotalCents,
  merchandiseDiscountCents:estimate.merchandiseDiscountCents,
  discountedMerchandiseCents:estimate.discountedMerchandiseCents,
  originalShippingCents:estimate.originalShippingCents,
  shippingCents:estimate.shippingCents,
  shippingDiscountCents:estimate.shippingDiscountCents,
  freeShippingReason:estimate.freeShippingReason,
  provisionalTaxableCents:estimate.taxableMerchandiseCents,
  taxCents:null,finalTotalCents:null,
  preTaxTotalCents:estimate.preTaxTotalCents,
  taxStatus:"awaiting_verified_destination_quote",
  quoteFinalized:false,canCreateOrder:false,canCreateInvoice:false,
  canPay:false,
 };
}
