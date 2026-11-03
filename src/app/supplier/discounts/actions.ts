"use server";

import { revalidatePath } from "next/cache";
import { getSupplierWorkspace } from "@/lib/auth/supplier-workspace";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import { quoteDiscount } from "@/lib/commerce/discount-quote.mjs";
import {quoteOptionalShipping} from "@/lib/commerce/checkout-charge-rules.mjs";
import {newPromotionActive} from "@/lib/commerce/promotion-management.mjs";

export type PromotionActionState={ok:boolean;message:string;subtotalCents?:number;
 discountCents?:number;shippingCents?:number;shippingDiscountCents?:number;
 totalCents?:number;freeShippingReason?:string};
type State=PromotionActionState;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const disabled:State={ok:false,message:"Discount code management is currently unavailable."};

async function permitted(storeId:string) {
  const w=await getSupplierWorkspace();
  if(w?.stores.some(s=>s.id===storeId&&!s.is_public&&
   w.memberships.some(m=>m.supplier_id===s.supplier_id&&
    ["owner","manager"].includes(m.role))))
    return {client:w.client,user:w.user};
  // Admin can manage the same private store, but never through a public
  // shortcut or user-controlled role claim.
  const client=await createSupplierServerClient();
  if(!client)return null;
  const {data,error}=await client.auth.getUser();
  if(error||!isVerifiedPlatformAdmin(data.user))return null;
  const allowed=await client.rpc("apex_can_edit_private_checkout_rules",{
   p_store_id:storeId,
  });
  if(allowed.error||allowed.data!==true)return null;
  return {client,user:data.user};
}
function cents(raw:FormDataEntryValue|null,allowZero=true) {
  if(typeof raw!=="string"||!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole,frac=""]=raw.split(".");
  const n=Number(whole)*100+Number(frac.padEnd(2,"0"));
  return Number.isSafeInteger(n)&&n<=999999999&&(allowZero||n>0)?n:null;
}
function dateValue(raw:FormDataEntryValue|null) {
  if(typeof raw!=="string" || !raw) return null;
  const parsed=new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString():undefined;
}

export async function saveSupplierPromotion(_prev:State,form:FormData):Promise<State> {
  if(process.env.APEX_DRAFT_PROMOS_ENABLED!=="true")return disabled;
  const storeId=form.get("storeId"),promoId=form.get("promoId");
  const rawCode=form.get("code"),kind=form.get("kind"),rawAmount=form.get("value");
  const rawMin=form.get("minimum"),rawLimit=form.get("usageLimit");
  const rawStart=form.get("startsAt"),rawEnd=form.get("endsAt");
  const activeOnCreate=newPromotionActive(form.get("initialStatus"));
  if(typeof storeId!=="string"||!uuid.test(storeId)||typeof promoId!=="string"||
    (promoId!==""&&!uuid.test(promoId))||typeof rawCode!=="string"||
    typeof kind!=="string"||(kind!=="free_shipping"&&typeof rawAmount!=="string")||
    typeof rawLimit!=="string"||
    activeOnCreate===null)
    return {ok:false,message:"Invalid promotion details."};
  const code=rawCode.trim().toUpperCase();
  if(!/^[A-Z0-9_-]{3,24}$/.test(code)||!["percentage","fixed","free_shipping"].includes(kind))
    return {ok:false,message:"Code must be 3–24 letters, digits, underscores or dashes."};
  const value=kind==="free_shipping"?1:kind==="percentage"
    ? (/^\d{1,2}$/.test(String(rawAmount))?Number(rawAmount):null)
    : cents(rawAmount,false);
  const minimum=cents(rawMin);
  const limit=rawLimit===""?null:(/^\d{1,7}$/.test(rawLimit)?Number(rawLimit):null);
  const start=dateValue(rawStart),end=dateValue(rawEnd);
  if(value===null||value<1||(kind==="percentage"&&value>95)||
    minimum===null||limit!==null&&(limit<1||limit>1000000)||
    start===undefined||end===undefined||
    (start&&end&&Date.parse(end)<=Date.parse(start))){
    return {ok:false,message:"Check discount, minimum order, optional usage limit and dates."};
  }
  const w=await permitted(storeId);
  if(!w)return {ok:false,message:"Supplier permission required."};
  const fields={discount_kind:kind,discount_value:value,min_subtotal_cents:minimum,
    starts_at:start,ends_at:end,usage_limit:limit};
  if(promoId){
    // Code and store are immutable: existing transactions may later reference them.
    const existing=await w.client.from("supplier_discount_codes")
      .select("id,code").eq("id",promoId).eq("store_id",storeId).maybeSingle();
    if(existing.error||!existing.data||existing.data.code!==code)
      return {ok:false,message:"Promotion not found or immutable code changed."};
    const result=await w.client.from("supplier_discount_codes")
      .update({...fields,updated_at:new Date().toISOString()})
      .eq("store_id",storeId).eq("id",promoId).select("id").maybeSingle();
    if(result.error||!result.data)return {ok:false,message:"Promotion could not be updated."};
  } else {
    const result=await w.client.from("supplier_discount_codes").insert({
      store_id:storeId,code,...fields,
      is_active:activeOnCreate,created_by:w.user.id,
    }).select("id").maybeSingle();
    if(result.error||!result.data)return {ok:false,message:"Code already exists or could not be saved."};
  }
  revalidatePath("/supplier/discounts");
  revalidatePath("/admin/shipping-promotions");
  return {ok:true,message:promoId?"Changes saved.":"Discount code created."};
}

export async function toggleSupplierPromotion(_prev:State,form:FormData):Promise<State> {
  if(process.env.APEX_DRAFT_PROMOS_ENABLED!=="true")return disabled;
  const storeId=form.get("storeId"),promoId=form.get("promoId"),enabled=form.get("enabled");
  if(typeof storeId!=="string"||!uuid.test(storeId)||typeof promoId!=="string"||
    !uuid.test(promoId)||!["true","false"].includes(String(enabled)))
    return {ok:false,message:"Invalid promotion."};
  const w=await permitted(storeId);
  if(!w)return {ok:false,message:"Supplier permission required."};
  const result=await w.client.from("supplier_discount_codes")
    .update({is_active:enabled==="true",updated_at:new Date().toISOString()})
    .eq("id",promoId).eq("store_id",storeId).select("id").maybeSingle();
  if(result.error||!result.data)return {ok:false,message:"Promotion status was not changed."};
  revalidatePath("/supplier/discounts");
  revalidatePath("/admin/shipping-promotions");
  return {ok:true,message:enabled==="true"?"Code activated.":"Code deactivated."};
}

export async function previewSupplierDiscount(_prev:State,form:FormData):Promise<State> {
  const storeId=form.get("storeId"),rawCode=form.get("code");
  if(typeof storeId!=="string"||!uuid.test(storeId)||typeof rawCode!=="string")
    return {ok:false,message:"Enter a valid discount code."};
  const subtotal=cents(form.get("subtotal"));
  if(subtotal===null)return {ok:false,message:"Enter a valid order subtotal."};
  const w=await permitted(storeId);
  if(!w)return {ok:false,message:"Supplier permission required."};
  const {data,error}=await w.client.from("supplier_discount_codes")
    .select("code,is_active,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count")
    .eq("store_id",storeId).eq("code",rawCode.trim().toUpperCase()).maybeSingle();
  if(error)return {ok:false,message:"Could not calculate the discount."};
  const result=quoteDiscount(data,subtotal);
  if(!result.eligible)return {ok:false,message:result.reason};
  const {data:policy,error:policyError}=await w.client
    .from("apex_store_shipping_settings")
    .select("charge_shipping,flat_shipping_cents,free_shipping_min_subtotal_cents")
    .eq("store_id",storeId).maybeSingle();
  if(policyError)return {ok:false,message:"Shipping settings could not be verified."};
  const shipping=quoteOptionalShipping(policy??{
    charge_shipping:false,flat_shipping_cents:0,
    free_shipping_min_subtotal_cents:null,
  },result.totalCents,("freeShipping" in result&&result.freeShipping===true));
  if(!shipping)return {ok:false,message:"Shipping calculation unavailable."};
  return {
    ok:true,message:"Discount calculated.",
    subtotalCents:subtotal,discountCents:result.discountCents,
    shippingCents:shipping.shippingCents,
    shippingDiscountCents:shipping.shippingDiscountCents,
    totalCents:result.totalCents+shipping.shippingCents,
    freeShippingReason:shipping.freeShippingReason,
  };

}
