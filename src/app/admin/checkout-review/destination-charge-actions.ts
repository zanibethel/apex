"use server";

import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {parsePrivateDestinationChargeSource,estimatePrivateDestinationCharges}
 from "@/lib/checkout/admin-destination-charge.mjs";

const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
export type DestinationEstimate={
 ok:boolean;message:string;name?:string;quantity?:number;
 expectedSubtotalCents?:number;subtotalMatchesDisplay?:boolean;
 availableUnits?:number|null;
 merchandiseSubtotalCents?:number;merchandiseDiscountCents?:number;
 discountedMerchandiseCents?:number;originalShippingCents?:number;
 shippingCents?:number;shippingDiscountCents?:number;
 freeShippingMinimumCents?:number|null;
 amountUntilFreeShippingCents?:number|null;
 freeShippingReason?:string;shippingBoxSize?:"small"|"medium";
 totalCents?:number;
 quoteFinalized?:false;canCreateOrder?:false;canCreateInvoice?:false;
 canPay?:false;
};
const blocked=(message:string):DestinationEstimate=>({ok:false,message});

export async function reviewAdminDestinationCharges(
 _previous:DestinationEstimate,form:FormData
):Promise<DestinationEstimate>{
 const productId=form.get("productId"),rawQty=form.get("quantity");
 const displayed=form.get("expectedSubtotalCents"),rawCode=form.get("code");
 const boxSize=form.get("boxSize");
 if(!isValidId(productId)||typeof rawQty!=="string"||
  !/^[1-3]$/.test(rawQty)||typeof displayed!=="string"||
  !/^(?:0|[1-9][0-9]{0,8})$/.test(displayed)||
  typeof rawCode!=="string"||rawCode.length>28||
  (boxSize!=="small"&&boxSize!=="medium"))
  return blocked("Choose a saved product and quantity with valid displayed pricing.");
 const code=rawCode.trim().toUpperCase();
 if(code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code))
  return blocked("Enter a valid discount code or leave it blank.");
 const expectedSubtotalCents=Number(displayed);
 if(!Number.isSafeInteger(expectedSubtotalCents)||
  expectedSubtotalCents>999999999)
  return blocked("Invalid displayed merchandise price.");
 const client=await createSupplierServerClient();
 if(!client)return blocked("Admin sign-in required.");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))
  return blocked("Verified platform admin required.");

 // Product price, promotion, and shipping settings come from a private
 // database statement, never from customer-provided amounts.
 const {data,error}=await client.rpc("get_admin_private_checkout_charge_source",{
  p_store_id:STORE_ID,p_product_id:productId,
  p_quantity:Number(rawQty),p_code:code,
 });
 if(error)return blocked("Saved shipping/price settings unavailable.");
 const parsed=parsePrivateDestinationChargeSource(data,{
  storeId:STORE_ID,productId,quantity:Number(rawQty),code,
 });
 if(!parsed)return blocked("Private price source failed verification.");
 const estimate=estimatePrivateDestinationCharges(parsed,{
  code,expectedSubtotalCents,boxSize,
 });
 if(!estimate)return blocked("Shipping estimate is incomplete or untrusted.");
 if(!estimate.ok)return blocked(estimate.message);
 return estimate as DestinationEstimate;
}
