"use server";

import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

type Result={ok:boolean;message:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveDraftPayoutSplit(_previous:Result,form:FormData):Promise<Result> {
  // Changing this does not affect actual BTCPay or Prism payout configuration.
  if(process.env.APEX_SPLIT_DRAFT_WRITES_ENABLED!=="true")
    return {ok:false,message:"Split draft changes are disabled until security review."};
  const storeId=form.get("storeId"), percentRaw=form.get("supplierPercent");
  const percent=Number(percentRaw);
  if(typeof storeId!=="string" || !uuid.test(storeId) ||
     typeof percentRaw!=="string" || !/^\d{1,3}$/.test(percentRaw) ||
     !Number.isInteger(percent) || percent<0 || percent>100)
    return {ok:false,message:"Enter a supplier percentage between 0 and 100."};
  const client=await createSupplierServerClient();
  if(!client) return {ok:false,message:"Admin dashboard unavailable."};
  const {data,error}=await client.auth.getUser();
  if(error || !isVerifiedPlatformAdmin(data.user)) return {ok:false,message:"Administrator access required."};
  // RLS additionally requires trusted app_metadata and the exact signed-in editor.
  const check=await client.from("stores").select("id").eq("id",storeId).maybeSingle();
  if(check.error || !check.data) return {ok:false,message:"Storefront unavailable."};
  const updated=await client.from("store_split_drafts").upsert({
    store_id:storeId, supplier_percent:percent, edited_by:data.user!.id,
    updated_at:new Date().toISOString(),
  },{onConflict:"store_id"});
  if(updated.error) return {ok:false,message:"The draft payout proposal could not be saved."};
  revalidatePath("/admin/splits");
  return {ok:true,message:"Proposed split saved with an audit entry. No live payout configuration changed."};
}
