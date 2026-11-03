"use server";
import {revalidatePath} from "next/cache";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {isValidId} from "@/lib/catalog/private-review-utils.mjs";

export type CategoryActionResult={ok:boolean;message:string};
export async function updateAdminCategoryPublication(
 _previous:CategoryActionResult,form:FormData
):Promise<CategoryActionResult>{
 const storeId=form.get("storeId"),categoryId=form.get("categoryId");
 const action=form.get("action"),reason=form.get("reason");
 if(!isValidId(storeId)||!isValidId(categoryId)||
  (action!=="publish"&&action!=="unpublish")||
  typeof reason!=="string"||reason.length>600||
  (action==="publish"&&reason.trim().length<3)||
  (reason.trim().length>0&&reason.trim().length<3))
  return {ok:false,message:"Choose a valid category action and provide a brief publication note."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin sign-in required."};
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  return {ok:false,message:"Verified platform admin access required."};
 const changed=await client.rpc("set_admin_category_publication",{
  p_store_id:storeId,p_category_id:categoryId,
  p_action:action,p_reason:reason,
 });
 if(changed.error||typeof changed.data!=="string")
  return {ok:false,message:"Category setting could not be verified. No success assumed."};
 revalidatePath("/admin/categories");
 revalidatePath("/admin/catalog-release");
 revalidatePath("/supplier/catalog/bulk");
 revalidatePath("/catalog");
 return {ok:true,message:changed.data};
}

export async function createAdminCategory(
 _previous:CategoryActionResult,form:FormData
):Promise<CategoryActionResult>{
 const storeId=form.get("storeId"),name=form.get("name");
 if(!isValidId(storeId)||typeof name!=="string"||
  name.length>90||!/^[A-Za-z0-9][A-Za-z0-9 &+/_-]*$/.test(name.trim())||
  name.trim().length<2||name.trim().length>60)
  return {ok:false,message:"Enter a valid category name (2–60 characters) and storefront."};
 const client=await createSupplierServerClient();
 if(!client)return {ok:false,message:"Admin sign-in required."};
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  return {ok:false,message:"Verified platform admin access required."};
 const result=await client.rpc("create_admin_catalog_category",{
  p_store_id:storeId,p_name:name,
 });
 if(result.error){
  if(result.error.code==="23505")
   return {ok:false,message:"A category with that name already exists for this storefront."};
  return {ok:false,message:"Category could not be created. No changes are assumed."};
 }
 if(result.data?.status!=="created"||result.data?.is_published!==false||
    !isValidId(result.data.category_id))
  return {ok:false,message:"Creation could not be confirmed. Refresh categories."};
 revalidatePath("/admin/categories");
 revalidatePath("/admin/catalog-release");
 revalidatePath("/supplier/catalog/bulk");
 return {ok:true,message:"Category created as unpublished. It can now be assigned to products."};
}
