"use server";

import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {normalizeReviewDestination,parsePrivateDestinationChargeSource,
 estimatePrivateDestinationCharges} from "@/lib/checkout/admin-destination-charge.mjs";

const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
export type DestinationEstimate={
 ok:boolean;message:string;name?:string;quantity?:number;
 expectedSubtotalCents?:number;subtotalMatchesDisplay?:boolean;
 availableUnits?:number|null;collectSalesTax?:boolean;
 destinationRegion?:string;destinationPostal?:string;destinationVerified?:boolean;
 merchandiseSubtotalCents?:number;merchandiseDiscountCents?:number;
 discountedMerchandiseCents?:number;originalShippingCents?:number;
 shippingCents?:number;shippingDiscountCents?:number;
 freeShippingReason?:string;provisionalTaxableCents?:number;
 preTaxTotalCents?:number;taxCents?:null;finalTotalCents?:null;
 taxStatus?:string;quoteFinalized?:false;canCreateOrder?:false;
 canCreateInvoice?:false;canPay?:false;
};
const blocked=(message:string):DestinationEstimate=>({ok:false,message});

export async function reviewAdminDestinationCharges(
 _previous:DestinationEstimate,form:FormData
):Promise<DestinationEstimate>{
 const productId=form.get("productId"),rawQty=form.get("quantity");
 const displayed=form.get("expectedSubtotalCents");
 const rawCode=form.get("code");
 if(!isValidId(productId)||typeof rawQty!=="string"||
  !/^[1-3]$/.test(rawQty)||typeof displayed!=="string"||
  !/^(?:0|[1-9][0-9]{0,8})$/.test(displayed)||
  typeof rawCode!=="string"||rawCode.length>28)
  return blocked("Choose one saved product and quantity with a valid displayed subtotal.");
 const code=rawCode.trim().toUpperCase();
 if(code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code))
  return blocked("Enter a valid discount code or leave it blank.");
 const expectedSubtotalCents=Number(displayed);
 if(!Number.isSafeInteger(expectedSubtotalCents)||
  expectedSubtotalCents>999999999)return blocked("Invalid displayed subtotal.");
 const destination=normalizeReviewDestination(form.get("state"),form.get("postal"));
 if(!destination)return blocked("Enter a valid U.S. state and five-digit ZIP.");
 const client=await createSupplierServerClient();
 if(!client)return blocked("Admin sign-in required.");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))
  return blocked("Verified platform admin required.");

 // Data is returned from one admin-only database statement. Neither input
 // price, browser tax flag nor browser discount amount is trusted.
 const {data,error}=await client.rpc("get_admin_private_checkout_charge_source",{
  p_store_id:STORE_ID,p_product_id:productId,
  p_quantity:Number(rawQty),p_code:code,
 });
 if(error)return blocked("Saved product and promotion quote unavailable. No amount was accepted.");
 const parsed=parsePrivateDestinationChargeSource(data,{
  storeId:STORE_ID,productId,quantity:Number(rawQty),code,
 });
 if(!parsed)return blocked("Checkout price source failed strict verification.");
 const result=estimatePrivateDestinationCharges(parsed,{
  destination,code,expectedSubtotalCents,
 });
 if(!result)return blocked("Checkout estimate is incomplete or untrusted.");
 if(!result.ok)return blocked(result.message);
 return result as DestinationEstimate;
}
