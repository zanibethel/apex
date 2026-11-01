import {DEMO_ITEMS} from "./preview-model.mjs";

/**
 * Browser helper for the NONPAYABLE demo quote. Only fictional SKU quantities,
 * selected delivery option and accepted demo coupon go to the server.
 * Contact/address details are intentionally never transmitted.
 */
export async function requestDemoServerQuote({quantities,shipping,coupon},fetchImpl=fetch){
 const items=DEMO_ITEMS.filter(item=>(quantities[item.id]??0)>0)
  .map(item=>({id:item.id,quantity:quantities[item.id]}));
 const response=await fetchImpl("/api/checkout/quote-preview",{
  method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({items,shipping,coupon}),
  signal:AbortSignal.timeout(8000),
 });
 if(!response.ok)throw Error("Demo total could not be verified");
 const data=await response.json();
 if(!data||data.mode!=="demo_only"||data.payable!==false||
  data.canCreateOrder!==false||data.canCreatePayment!==false||
  data.currency!=="USD"||data.taxStatus!=="not_calculated"||
  data.finalAmountDueCents!==null||
  !Number.isSafeInteger(data.illustrativeTotalCents)||
  data.illustrativeTotalCents<=0||
  typeof data.illustrativeBtcSats!=="string"||
  !/^[0-9]+$/.test(data.illustrativeBtcSats)||
  typeof data.expiresAt!=="string"||
  !Number.isFinite(Date.parse(data.expiresAt))||
  Date.parse(data.expiresAt)<=Date.now())
  throw Error("Unexpected demo quote response");
 return data;
}
