"use server";

import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

type Result={ok:boolean;message:string};
export async function saveSupplierListingIntent(_previous:Result,form:FormData):Promise<Result>{
 const storeId=form.get("storeId"),productId=form.get("productId"),action=form.get("action");
 if(!isValidId(storeId)||!isValidId(productId)||
    (action!=="publish"&&action!=="unpublish"))
   return {ok:false,message:"Invalid listing action."};
 if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
   return {ok:false,message:"Supplier listing controls are disabled."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Supplier sign-in required."};
 const {data:auth,error}=await client.auth.getUser();
 if(error||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
   return {ok:false,message:"Supplier sign-in required."};
 // Server-side RPC independently validates private product, owner/manager,
 // eight field completeness, and any active admin hold.
 const result=await client.rpc("set_supplier_listing_intent",{
  p_store_id:storeId,p_product_id:productId,p_action:action,
 });
 if(result.error||!result.data)
  return {ok:false,message:"Cannot save the listing preference. Verify setup and any admin hold, then refresh."};
 revalidatePath("/supplier/catalog");
 revalidatePath("/admin/listing-controls");
 return {ok:true,message:result.data};
}
