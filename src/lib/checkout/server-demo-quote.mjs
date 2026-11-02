import {DEMO_ITEMS,DEMO_RATE_CENTS,DEMO_SHIPPING,demoTotals} from "./preview-model.mjs";

/**
 * Server-authoritative but NEVER PAYABLE checkout demonstration.
 * Only two fictional merchandise SKUs exist. Client-supplied prices, stock,
 * product identifiers from real catalogues, tax, shipping charges and wallet
 * destinations are rejected, never trusted.
 */
export class DemoQuoteInputError extends Error{
 constructor(message="Invalid demo quote request"){super(message);this.name="DemoQuoteInputError";}
}
const allowedKeys=new Set(["items","shipping","coupon"]);
const allowedItems=new Set(["id","quantity"]);
const skuIds=new Set(DEMO_ITEMS.map(item=>item.id));
const shippingIds=new Set(Object.keys(DEMO_SHIPPING));
const own=Object.hasOwn;

export function validateDemoQuoteRequest(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    Object.keys(raw).some(key=>!allowedKeys.has(key))||
    !own(raw,"items")||!own(raw,"shipping")||!own(raw,"coupon"))
  throw new DemoQuoteInputError();
 const {items,shipping,coupon}=raw;
 if(!Array.isArray(items)||items.length<1||items.length>DEMO_ITEMS.length||
    typeof shipping!=="string"||!shippingIds.has(shipping)||
    typeof coupon!=="string"||coupon.length>20||
    !["","DEMO10"].includes(coupon))
  throw new DemoQuoteInputError();
 const quantities={};
 for(const item of items){
  if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).some(key=>!allowedItems.has(key))||
     Object.keys(item).length!==2||
     typeof item.id!=="string"||!skuIds.has(item.id)||
     own(quantities,item.id)||!Number.isInteger(item.quantity)||
     item.quantity<1||item.quantity>5)
    throw new DemoQuoteInputError();
  quantities[item.id]=item.quantity;
 }
 return Object.freeze({quantities:Object.freeze(quantities),shipping,coupon});
}
export function calculateDemoServerQuote(raw,{now=Date.now()}={}){
 const request=validateDemoQuoteRequest(raw);
 if(!Number.isSafeInteger(now)||now<0)
  throw new DemoQuoteInputError();
 const totals=demoTotals(request);
 if(!totals.items.length||totals.totalCents<=0||
    !Number.isSafeInteger(totals.totalCents))
  throw new DemoQuoteInputError();
 const expiresAt=new Date(now+5*60*1000).toISOString();
 return Object.freeze({
  schemaVersion:1,
  mode:"demo_only",
  canCreateOrder:false,
  canCreatePayment:false,
  payable:false,
  currency:"USD",
  items:Object.freeze(totals.items.map(item=>Object.freeze({
   id:item.id,name:item.name,quantity:item.quantity,
   unitCents:item.unitCents,lineCents:item.unitCents*item.quantity,
  }))),
  subtotalCents:totals.subtotalCents,
  discountCents:totals.discountCents,
  shippingCents:totals.shippingCents,
  illustrativeTotalCents:totals.totalCents,
  taxStatus:"not_calculated",
  finalAmountDueCents:null,
  illustrativeBtcSats:totals.mockSats,
  illustrativeUsdPerBtcCents:DEMO_RATE_CENTS,
  expiresAt,
 });
}
