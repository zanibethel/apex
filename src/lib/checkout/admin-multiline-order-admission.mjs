import {previewCheckoutCharges} from "../commerce/checkout-charge-rules.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY=/^(?:0|[1-9][0-9]{0,8})$/;
const CHECKS=[
 "supplier_requested","admin_clear","identity_clear","content_review_clear",
 "product_setup_complete","supplier_authorized","product_authorized",
 "public_release_enabled",
];
const integerCents=value=>typeof value==="string"&&MONEY.test(value)?Number(value):null;
const deny=reason=>Object.freeze({ok:false,reason,canCreateOrder:false,
 canReserveStock:false,canCreateInvoice:false,canPay:false});

export function normalizeAdminAdmissionItems(input){
 if(!Array.isArray(input)||input.length<1||input.length>8)return null;
 const seen=new Set();
 let units=0;
 const out=[];
 for(const row of input){
  if(!row||typeof row!=="object"||Array.isArray(row)||
   Object.keys(row).length!==2||!UUID.test(row.product_id)||
   seen.has(row.product_id)||!Number.isInteger(row.quantity)||
   row.quantity<1||row.quantity>10)return null;
  seen.add(row.product_id);
  units+=row.quantity;
  if(units>50)return null;
  out.push(Object.freeze({product_id:row.product_id,quantity:row.quantity}));
 }
 return Object.freeze(out);
}

// The locked RPC is a private observation, not a reservation. Locks terminate
// when the transaction returns; even all-true checks cannot authorize checkout.
export function parseAdminMultiLineLockedReadback(raw,storeId,input,expected){
 const items=normalizeAdminAdmissionItems(input);
 if(!items||!UUID.test(storeId)||!Number.isSafeInteger(expected)||
  expected<0||expected>999999999||
  !raw||typeof raw!=="object"||Array.isArray(raw)||
  raw.schema_version!==2||raw.state!=="locked_private_preflight"||
  raw.store_id!==storeId||raw.currency!=="USD"||
  raw.lock_mode!=="for_share_nowait"||
  raw.locks_persist_after_response!==false||raw.admission!=="blocked"||
  raw.expected_subtotal_cents!==String(expected)||
  typeof raw.subtotal_matches_display!=="boolean"||
  raw.can_quote!==false||raw.can_reserve_stock!==false||
  raw.can_create_order!==false||raw.can_create_invoice!==false||
  raw.can_pay!==false||raw.shipping_calculated!==false||
  raw.tax_calculated!==false||!Array.isArray(raw.items)||
  raw.items.length!==items.length||
  raw.total_units!==items.reduce((sum,line)=>sum+line.quantity,0))
  return null;
 const subtotal=integerCents(raw.observed_subtotal_cents);
 if(subtotal===null||raw.subtotal_matches_display!==(subtotal===expected))
  return null;
 const sourceById=new Map();
 for(const line of raw.items){
  if(!line||typeof line!=="object"||Array.isArray(line)||
   typeof line.product_id!=="string"||!UUID.test(line.product_id)||
   sourceById.has(line.product_id))return null;
  sourceById.set(line.product_id,line);
 }
 const checked=[];
 let sum=0,allPricesValid=true,allStockVerified=true,allPrereqsMet=true;
 for(const line of items){
  const observed=sourceById.get(line.product_id);
  if(!observed||observed.quantity!==line.quantity||
   typeof observed.name!=="string"||observed.name.trim().length<1||
   observed.name.length>300||
   typeof observed.sku!=="string"||observed.sku.trim().length<1||
   observed.sku.length>120||observed.currency!=="USD"||
   typeof observed.saved_price_valid!=="boolean"||
   typeof observed.quantity_available!=="boolean"||
   typeof observed.release_status_code!=="string"||
   observed.release_status_code.length<1||
   observed.release_status_code.length>100||
   observed.can_order!==false||observed.can_pay!==false||
   !observed.release_checks||typeof observed.release_checks!=="object"||
   Array.isArray(observed.release_checks)||
   CHECKS.some(key=>typeof observed.release_checks[key]!=="boolean")||
   (observed.available_units!==null&&(!Number.isSafeInteger(observed.available_units)||
    observed.available_units<0||observed.available_units>1_000_000_000)))
   return null;
  const price=observed.saved_price_valid?
   integerCents(observed.unit_price_cents):null;
  const lineTotal=observed.saved_price_valid?
   integerCents(observed.line_subtotal_cents):null;
  if(observed.saved_price_valid?
    price===null||price<1||lineTotal===null||lineTotal!==price*line.quantity:
    observed.unit_price_cents!==null||observed.line_subtotal_cents!==null)
    return null;
  sum+=lineTotal??0;
  if(sum>999999999)return null;
  if(!observed.saved_price_valid)allPricesValid=false;
  const quantityAvailable=observed.available_units!==null&&
   observed.available_units>0&&observed.available_units>=line.quantity;
  if(observed.quantity_available!==quantityAvailable)return null;
  if(!quantityAvailable)allStockVerified=false;
  const checks=Object.freeze(CHECKS.map(key=>Object.freeze({
   key,passed:observed.release_checks[key],
  })));
  if(checks.some(c=>!c.passed))allPrereqsMet=false;
  checked.push(Object.freeze({
   productId:line.product_id,name:observed.name,sku:observed.sku,
   quantity:line.quantity,unitPriceCents:price,lineTotalCents:lineTotal,
   availableUnits:observed.available_units,stockSufficient:quantityAvailable,
   releaseStatus:observed.release_status_code,checks,
  }));
 }
 if(sum!==subtotal)return null;
 return Object.freeze({
  subtotalCents:subtotal,subtotalMatchesDisplay:raw.subtotal_matches_display,
  items:Object.freeze(checked),allPricesValid,allStockVerified,allPrereqsMet,
  locksPersistAfterResponse:false,canCreateOrder:false,canPay:false,
 });
}

export function prepareAdminOrderAdmission({
 readback,storeId,items,expectedSubtotalCents,shippingPolicy,
 promotion=null,boxSize="small",code="",now=new Date(),
}){
 const parsed=parseAdminMultiLineLockedReadback(
  readback,storeId,items,expectedSubtotalCents);
 if(!parsed)return deny("Current saved prices and stock could not be verified.");
 if(!parsed.subtotalMatchesDisplay)
  return deny("Catalog prices changed during verification. Refresh and retry.");
 if(typeof code!=="string"||
  (code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code)))
  return deny("Invalid discount code.");
 if(code!==""&&(!promotion||promotion.code!==code))
  return deny("Discount code is unavailable.");
 if(!parsed.allPricesValid)
  return Object.freeze({ok:true,items:parsed.items,
   status:"price_unavailable",totals:null,allStockVerified:parsed.allStockVerified,
   allPrereqsMet:parsed.allPrereqsMet,canCreateOrder:false,
   canReserveStock:false,canCreateInvoice:false,canPay:false});
 const lines=parsed.items.map(row=>({
  productId:row.productId,quantity:row.quantity,
  unitPriceCents:row.unitPriceCents,
 }));
 const totals=previewCheckoutCharges({
  lines,shippingPolicy,discountCode:promotion,boxSize,now,
 });
 if(!totals.ok||totals.canPlaceOrder!==false||
  totals.canCreateInvoice!==false||totals.canPay!==false||
  totals.quoteFinalized!==false)return deny("Shipping or discount review unavailable.");
 return Object.freeze({
  ok:true,status:"private_order_review",items:parsed.items,
  totals:Object.freeze({
   merchandiseSubtotalCents:totals.merchandiseSubtotalCents,
   merchandiseDiscountCents:totals.merchandiseDiscountCents,
   discountedMerchandiseCents:totals.discountedMerchandiseCents,
   shippingBoxSize:totals.shippingBoxSize,shippingCents:totals.shippingCents,
   freeShippingReason:totals.freeShippingReason,totalCents:totals.totalCents,
   currency:"USD",
  }),
  allStockVerified:parsed.allStockVerified,
  allPrereqsMet:parsed.allPrereqsMet,
  // A read-only snapshot can never be reused as a held order or a checkout permit.
  canCreateOrder:false,canReserveStock:false,
  canCreateInvoice:false,canPay:false,
 });
}
