"use server";
import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

export type CheckoutRulesActionResult={
 ok:boolean;message:string;changed?:number;
};
const fail=(message:string):CheckoutRulesActionResult=>({ok:false,message});
const cents=(raw:FormDataEntryValue|null)=>{
 if(typeof raw!=="string"||!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(raw))
  return null;
 const [whole,fraction=""]=raw.split(".");
 const n=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(n)&&n<=999999999?n:null;
};
async function signedInClient(){
 const client=await createSupplierServerClient();
 if(!client)return null;
 const {data,error}=await client.auth.getUser();
 return error||!data.user||data.user.is_anonymous||
  !data.user.email_confirmed_at?null:client;
}
function refreshRules(){
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/supplier/catalog");
 revalidatePath("/supplier/shipping");
 revalidatePath("/supplier/discounts");
 revalidatePath("/admin/checkout-rules");
 revalidatePath("/admin/checkout-review");
}

export async function saveStoreShippingConfiguration(
 _previous:CheckoutRulesActionResult,form:FormData
):Promise<CheckoutRulesActionResult>{
 const storeId=form.get("storeId"),charge=form.get("chargeShipping");
 if(!isValidId(storeId)||(charge!=="true"&&charge!=="false"))
  return fail("Invalid shipping selection.");
 const isCharged=charge==="true";
 const fee=isCharged?cents(form.get("smallFlatShipping")):0;
 const mediumFee=isCharged?cents(form.get("mediumFlatShipping")):0;
 const thresholdRaw=form.get("freeShippingMinimum");
 const threshold=isCharged?cents(thresholdRaw):null;
 if(fee===null||mediumFee===null||
  (isCharged&&(fee<1||mediumFee<fee||threshold===null||threshold<1)))
  return fail("Enter valid Padded Envelope and Medium Box rates and a positive free-shipping minimum.");
 const client=await signedInClient();
 if(!client)return fail("Sign in with an authorized supplier or admin account.");
 const {data,error}=await client.rpc("save_private_store_usps_shipping_settings",{
  p_store_id:storeId,p_charge_shipping:isCharged,
  p_small_flat_rate_cents:fee,
  p_medium_flat_rate_cents:mediumFee,
  p_free_shipping_min_subtotal_cents:threshold,
 });
 if(error||!data||data.status!=="saved"||
  data.checkout_enabled!==false||
  data.charge_shipping!==isCharged||
  data.flat_shipping_cents!==fee||
  data.medium_flat_shipping_cents!==mediumFee||
  data.free_shipping_min_subtotal_cents!==threshold)
  return fail("Shipping rules could not be saved. Refresh and retry.");
 refreshRules();
 return {ok:true,message:"USPS Padded Envelope / Medium Box shipping rates saved. No checkout or payment enabled."};
}
