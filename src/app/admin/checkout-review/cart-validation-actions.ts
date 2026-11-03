"use server";

import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";
import {parseAdminLockedCartPreflight} from "@/lib/checkout/admin-private-cart-validation.mjs";

const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
type CheckedItem={
 name:string;quantity:number;availableUnits:number|null;
 priceCents:number|null;observedSubtotalCents:number;
 stockSufficient:boolean;releaseStatus:string;
 subtotalMatchesDisplay:boolean;expectedSubtotalCents:number;
 checks:ReadonlyArray<{key:string;passed:boolean}>;
};
export type AdminCartValidationResult={
 ok:boolean;message:string;item:CheckedItem|null;
};
export async function validateAdminCartSelection(
 _previous:AdminCartValidationResult,form:FormData
):Promise<AdminCartValidationResult>{
 const blocked=(message:string):AdminCartValidationResult=>({
  ok:false,message,item:null,
 });
 const productId=form.get("productId"),qty=form.get("quantity");
 const expected=form.get("expectedSubtotalCents");
 if(!isValidId(productId)||typeof qty!=="string"||
  !/^[1-3]$/.test(qty)||typeof expected!=="string"||
  !/^(?:0|[1-9][0-9]{0,8})$/.test(expected))
  return blocked("Select one valid product and quantity (1–3).");
 const quantity=Number(qty),expectedSubtotalCents=Number(expected);
 if(!Number.isSafeInteger(expectedSubtotalCents)||
   expectedSubtotalCents>999999999)return blocked("Invalid displayed subtotal.");
 const client=await createSupplierServerClient();
 if(!client)return blocked("Admin sign-in required.");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))
  return blocked("Verified platform admin access required.");

 const {data,error}=await client.rpc("get_admin_locked_cart_preflight",{
  p_store_id:STORE_ID,
  p_items:[{product_id:productId,quantity}],
  p_expected_subtotal_cents:expectedSubtotalCents,
 });
 if(error)return blocked("Price/stock validation unavailable. No order was created.");
 const parsed=parseAdminLockedCartPreflight(
  data,STORE_ID,productId,quantity,expectedSubtotalCents);
 if(!parsed)return blocked("Database validation readback could not be confirmed.");
 return {
  ok:true,
  message:parsed.subtotalMatchesDisplay?
    "Locked database recheck matched the displayed subtotal. No stock reserved or order created.":
    "The saved subtotal changed. Refresh the review before proceeding; no order created.",
  item:{
   name:parsed.name,quantity:parsed.quantity,
   availableUnits:parsed.availableUnits,priceCents:parsed.priceCents,
   observedSubtotalCents:parsed.observedSubtotalCents,
   stockSufficient:parsed.stockSufficient,
   releaseStatus:parsed.releaseStatus,checks:parsed.checks,
   subtotalMatchesDisplay:parsed.subtotalMatchesDisplay,
   expectedSubtotalCents:parsed.expectedSubtotalCents,
  },
 };
}
