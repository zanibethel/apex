import "server-only";

import {randomUUID} from "node:crypto";
import {
 resolveTaxCloudBinding,providerStatusPublic,canQuoteProduct,
 makeTaxCloudCart,verifyTaxCloudCart,taxCloudEndpoint,
} from "./taxcloud-v3-contract.mjs";

const fail=(status,detail)=>Object.freeze({
 status,detail,taxEstimateCents:null,estimatedTotalCents:null,
 quoteFinalized:false,canCreateOrder:false,canCreateInvoice:false,canPay:false,
});
const getBinding=(storeId)=>resolveTaxCloudBinding(
 process.env.APEX_TAXCLOUD_BINDINGS_JSON,storeId,process.env);

async function callProvider({connectionId,key,operation,body}){
 const url=taxCloudEndpoint(connectionId,operation);
 if(!url)return null;
 try{
  const response=await fetch(url,{
   method:operation==="ping"?"GET":"POST",
   headers:{"X-API-KEY":key,"Accept":"application/json",
    ...(operation==="carts"?{"Content-Type":"application/json"}:{})},
   ...(operation==="carts"?{body:JSON.stringify(body)}:{}),
   redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(5000),
  });
  if(!response.ok)return {ok:false,status:response.status};
  const declared=Number(response.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>65536)return null;
  const text=await response.text();
  if(text.length>65536)return null;
  return {ok:true,data:JSON.parse(text)};
 }catch{return null;}
}

export async function probeTaxCloudForAdmin(storeId){
 const config=getBinding(storeId);
 const publicStatus=providerStatusPublic(config);
 if(config.status!=="ready")return {
  ...publicStatus,detail:config.reason??"Provider is not configured."};
 const pong=await callProvider({connectionId:config.connectionId,
  key:config.key,operation:"ping"});
 if(!pong)return {...publicStatus,status:"unreachable",
  detail:"TaxCloud could not be reached securely."};
 if(!pong.ok)return {...publicStatus,
  status:pong.status===401||pong.status===403?"key_denied":"provider_error",
  detail:"TaxCloud did not confirm private store access."};
 if(pong.data?.message!=="Success")return {...publicStatus,
  status:"invalid_response",detail:"TaxCloud ping was not verified."};
 return {...publicStatus,status:"connected",connected:true,
  detail:"TaxCloud API credentials and scoped connection responded to Ping. Product classification and quote verification remain separate."};
}

export async function requestPrivateTaxCloudEstimate({
 storeId,productId,collectSalesTax,quantity,unitPriceCents,
 discountCents,shippingCents,preTaxTotalCents,destination,
}){
 // No checkout release, no invoice capability, and no provider calls by default.
 if(process.env.APEX_TAXCLOUD_PRIVATE_ESTIMATES_ENABLED!=="true")
  return fail("quote_disabled","Private provider estimates are not enabled.");
 const config=getBinding(storeId);
 if(config.status!=="ready")
  return fail(config.status,"TaxCloud store credentials and approved origin are required.");
 const rule=canQuoteProduct(config,productId,collectSalesTax);
 if(!rule.ok)return fail("classification_pending",rule.reason);
 const cart=makeTaxCloudCart({
  connectionId:config.connectionId,origin:config.origin,
  destination,productId,quantity,unitPriceCents,
  discountCents,shippingCents,tic:rule.tic,
  customerId:"apex-admin-review-"+randomUUID(),
 });
 if(!cart)return fail("invalid_quote_inputs",
  "Full delivery address and saved order charges are required.");
 if(cart.expected.discountedMerchandiseCents+shippingCents!==preTaxTotalCents)
  return fail("mismatched_total","The server-priced merchandise and shipping totals changed.");
 const provider=await callProvider({connectionId:config.connectionId,
  key:config.key,operation:"carts",body:cart.body});
 if(!provider||!provider.ok)
  return fail("provider_unavailable","TaxCloud estimate was not available.");
 const verified=verifyTaxCloudCart(provider.data,cart.expected);
 if(!verified||verified.preTaxTotalCents!==preTaxTotalCents)
  return fail("provider_response_unverified",
   "The provider response could not be matched to the current saved cart.");
 // The cart call does not convert to an order, persist an internal tax quote
 // with a signed TTL, reserve inventory, or authorize a payment.
 return {status:"taxcloud_estimate",detail:"TaxCloud cart estimate verified against the requested items and address; not a payable final total.",
  ...verified};
}
