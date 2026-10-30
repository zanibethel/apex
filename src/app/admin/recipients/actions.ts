"use server";
import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
type Result = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function saveRecipient(_previous: Result, form: FormData): Promise<Result> {
 if (process.env.APEX_RECIPIENT_ADMIN_WRITES_ENABLED !== "true")
   return { ok:false, message:"Recipient editing is disabled until security approval." };
 const id=form.get("id"), name=form.get("displayName"), type=form.get("recipientType"), status=form.get("status");
 if (typeof name!=="string" || !name.trim() || name.trim().length>100 ||
     !["platform","supplier","partner","other"].includes(String(type)) ||
     !["active","inactive"].includes(String(status)) ||
     (id!==null && (typeof id!=="string" || (id!=="" && !uuid.test(id)))))
   return {ok:false,message:"Enter a valid recipient name, type, and status."};
 const client=await createSupplierServerClient();
 if(!client) return {ok:false,message:"Admin service unavailable."};
 const {data,error}=await client.auth.getUser();
 if(error || !isVerifiedPlatformAdmin(data.user))
   return {ok:false,message:"Verified administrator access required."};
 const fields={display_name:name.trim(),recipient_type:type as string,status:status as string};
 const result=id ? await client.from("payout_recipients").update(fields).eq("id",id).select("id").maybeSingle()
   : await client.from("payout_recipients").insert(fields).select("id").maybeSingle();
 if(result.error || !result.data) return {ok:false,message:"Recipient could not be saved. Check database migration and admin membership."};
 revalidatePath("/admin/recipients");
 revalidatePath("/admin/splits/configure");
 return {ok:true,message:"Recipient saved. No wallet, ownership membership, or payout was changed."};
}
