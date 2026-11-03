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

export async function saveSelectedTaxCollection(
 _previous:CheckoutRulesActionResult,form:FormData
):Promise<CheckoutRulesActionResult>{
 const storeId=form.get("storeId"),raw=form.get("productIds"),choice=form.get("collectSalesTax");
 if(!isValidId(storeId)||typeof raw!=="string"||raw.length>3000||
  (choice!=="true"&&choice!=="false"))return fail("Invalid tax selection.");
 const ids=raw.split(",").filter(Boolean);
 if(ids.length<1||ids.length>50||
  ids.some(id=>!isValidId(id))||new Set(ids).size!==ids.length)
  return fail("Choose between 1 and 50 different saved products.");
 const client=await signedInClient();
 if(!client)return fail("Sign in with an authorized supplier or admin account.");
 const {data,error}=await client.rpc("set_bulk_product_tax_collection",{
  p_store_id:storeId,p_product_ids:ids,p_collect_sales_tax:choice==="true",
 });
 if(error||!data||data.status!=="saved"||
  data.selected!==ids.length||data.checkout_enabled!==false||
  typeof data.changed!=="number")return fail(
   "Tax options could not be saved. Check product ownership and refresh.");
 refreshRules();
 return {ok:true,changed:data.changed,message:
  `Updated ${data.changed} of ${ids.length} product tax setting(s). Checkout remains disabled.`};
}

export async function saveStoreShippingConfiguration(
 _previous:CheckoutRulesActionResult,form:FormData
):Promise<CheckoutRulesActionResult>{
 const storeId=form.get("storeId"),charge=form.get("chargeShipping");
 if(!isValidId(storeId)||(charge!=="true"&&charge!=="false"))
  return fail("Invalid shipping selection.");
 const isCharged=charge==="true";
 const fee=isCharged?cents(form.get("flatShipping")):0;
 const thresholdRaw=form.get("freeShippingMinimum");
 const threshold=isCharged&&thresholdRaw!==""?
  cents(thresholdRaw):null;
 if(fee===null||threshold===null&&isCharged&&thresholdRaw!==""||
  threshold!==null&&threshold<1)
  return fail("Enter a valid shipping fee and optional positive free-shipping minimum.");
 const client=await signedInClient();
 if(!client)return fail("Sign in with an authorized supplier or admin account.");
 const {data,error}=await client.rpc("save_private_store_shipping_settings",{
  p_store_id:storeId,p_charge_shipping:isCharged,
  p_flat_shipping_cents:fee,
  p_free_shipping_min_subtotal_cents:threshold,
 });
 if(error||!data||data.status!=="saved"||
  data.checkout_enabled!==false||
  data.charge_shipping!==isCharged)
  return fail("Shipping rules could not be saved. Refresh and retry.");
 refreshRules();
 return {ok:true,message:"Private shipping rules saved. No checkout or payment enabled."};
}
