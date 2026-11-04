"use server";

import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {normalizeAdminAdmissionItems,prepareAdminOrderAdmission}
 from "@/lib/checkout/admin-multiline-order-admission.mjs";

const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const OBSERVED_CENTS=/^(?:0|[1-9][0-9]{0,8})$/;

export type OrderAdmissionReviewState={
 ok:boolean;message:string;selectionKey:string;
 review:null|{
  status:string;allStockVerified:boolean;allPrereqsMet:boolean;
  canCreateOrder:false;canReserveStock:false;canCreateInvoice:false;canPay:false;
  items:Array<{
   productId:string;name:string;sku:string;quantity:number;
   unitPriceCents:number|null;lineTotalCents:number|null;
   availableUnits:number|null;stockSufficient:boolean;releaseStatus:string;
   checks:Array<{key:string;passed:boolean}>;
  }>;
  totals:null|{
   merchandiseSubtotalCents:number;merchandiseDiscountCents:number;
   discountedMerchandiseCents:number;shippingBoxSize:string;
   shippingCents:number;freeShippingReason:string;totalCents:number;currency:"USD";
  };
 };
};
const unavailable=(message:string):OrderAdmissionReviewState=>({
 ok:false,message,selectionKey:"",review:null,
});

export async function inspectPrivateOrderAdmission(
 _previous:OrderAdmissionReviewState,form:FormData
):Promise<OrderAdmissionReviewState>{
 const rawItems=form.get("items"),rawBox=form.get("boxSize"),rawCode=form.get("code");
 if(typeof rawItems!=="string"||rawItems.length>1300||
  (rawBox!=="small"&&rawBox!=="medium")||typeof rawCode!=="string")
  return unavailable("Select valid products and a USPS package.");
 const code=rawCode.trim().toUpperCase();
 if(code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code))
  return unavailable("Enter a valid discount code.");
 let input:unknown;
 try{input=JSON.parse(rawItems);}catch{
  return unavailable("Cart selection could not be read.");
 }
 const items=normalizeAdminAdmissionItems(input);
 if(!items)return unavailable("Choose 1–8 distinct products, up to 10 each and 50 total units.");
 const selectionKey=JSON.stringify({items,boxSize:rawBox,code});
 const client=await createSupplierServerClient();
 if(!client)return unavailable("Admin sign-in required.");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))
  return unavailable("Verified administrator access required.");

 // The first call supplies a server-observed amount, never the form's price.
 // The second call rechecks product and inventory rows under NOWAIT locks.
 // Locks end when the RPC returns; a result cannot authorize a later order.
 const first=await client.rpc("get_admin_private_cart_validation",{
  p_store_id:STORE_ID,p_items:items,
 });
 if(first.error||!first.data||typeof first.data!=="object"||
  first.data.state!=="private_cart_observation"||
  first.data.can_create_order!==false||first.data.can_pay!==false||
  typeof first.data.observed_subtotal_cents!=="string"||
  !OBSERVED_CENTS.test(first.data.observed_subtotal_cents))
  return unavailable("Saved catalog stock and pricing could not be checked.");
 const expected=Number(first.data.observed_subtotal_cents);
 const locked=await client.rpc("get_admin_locked_cart_preflight",{
  p_store_id:STORE_ID,p_items:items,p_expected_subtotal_cents:expected,
 });
 if(locked.error||!locked.data)
  return unavailable("Inventory changed or was unavailable during the locked recheck.");

 const policyRead=await client.from("apex_store_shipping_settings")
  .select("charge_shipping,flat_shipping_cents,medium_flat_shipping_cents,free_shipping_min_subtotal_cents,envelope_max_items")
  .eq("store_id",STORE_ID).maybeSingle();
 if(policyRead.error||!policyRead.data)
  return unavailable("Current USPS shipping policy could not be verified.");
 let promotion=null;
 if(code){
  const promoRead=await client.from("supplier_discount_codes")
   .select("code,is_active,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count")
   .eq("store_id",STORE_ID).eq("code",code).maybeSingle();
  if(promoRead.error||!promoRead.data)
   return unavailable("Discount code is unavailable.");
  promotion=promoRead.data;
 }
 const review=prepareAdminOrderAdmission({
  readback:locked.data,storeId:STORE_ID,items,expectedSubtotalCents:expected,
  shippingPolicy:policyRead.data,promotion,boxSize:rawBox,code,
 });
 if(!review.ok)return unavailable(review.reason);
 return {
  ok:true,selectionKey,message:"Current catalog and shipping records checked. No order or invoice was created.",
  review:{
   status:review.status,allStockVerified:review.allStockVerified,
   allPrereqsMet:review.allPrereqsMet,
   canCreateOrder:false,canReserveStock:false,canCreateInvoice:false,canPay:false,
   items:review.items.map(line=>({
    productId:line.productId,name:line.name,sku:line.sku,quantity:line.quantity,
    unitPriceCents:line.unitPriceCents,lineTotalCents:line.lineTotalCents,
    availableUnits:line.availableUnits,stockSufficient:line.stockSufficient,
    releaseStatus:line.releaseStatus,
    checks:line.checks.map(check=>({key:check.key,passed:check.passed})),
   })),
   totals:review.totals,
  },
 };
}
