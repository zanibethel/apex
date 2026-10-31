"use server";

import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";

const bucket="apex-draft-product-images";
// Store/product IDs and image object names use complete UUIDs (8-4-4-4-12).
const idRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageFileRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const mimeToExt:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};

async function scopedProduct(storeId:string,productId:string) {
  if(!idRe.test(storeId)||!idRe.test(productId)) return null;
  const w=await getSupplierWorkspace();
  if(!w || !w.stores.some(s=>s.id===storeId&&!s.is_public&&
    w.memberships.some(m=>m.supplier_id===s.supplier_id&&["owner","manager"].includes(m.role))))
    return null;
  const {data,error}=await w.client.from("products").select("id")
    .eq("store_id",storeId).eq("id",productId).eq("is_published",false).maybeSingle();
  return error||!data?null:w;
}

export async function requestProductImageUpload(
  storeId:string,productId:string,mime:string,size:number
):Promise<{ok:boolean;message:string;path?:string;token?:string}> {
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")return {ok:false,message:"Image upload is disabled."};
  const ext=mimeToExt[mime];
  if(!ext||!Number.isSafeInteger(size)||size<1||size>3145728)
    return {ok:false,message:"Choose a PNG, JPEG or WebP image no larger than 3 MB."};
  const w=await scopedProduct(storeId,productId);
  if(!w)return {ok:false,message:"Product upload permission required."};
  const path=`${storeId}/${productId}/${randomUUID()}.${ext}`;
  const {data,error}=await w.client.storage.from(bucket).createSignedUploadUrl(path);
  return error||!data?.token?{ok:false,message:"Private image upload is not available."}
    : {ok:true,message:"",path,token:data.token};
}

export async function attachProductImage(storeId:string,productId:string,path:string) {
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")return {ok:false,message:"Image management is disabled."};
  const prefix=`${storeId}/${productId}/`;
  if(!idRe.test(storeId)||!idRe.test(productId)||
     !path.startsWith(prefix)||!imageFileRe.test(path.slice(prefix.length)))
    return {ok:false,message:"Invalid image path."};
  const w=await scopedProduct(storeId,productId);
  if(!w)return {ok:false,message:"Product image permission required."};
  const folder=`${storeId}/${productId}`,file=path.slice(folder.length+1);
  const {data:objects,error:listError}=await w.client.storage.from(bucket).list(folder,{
    limit:100,search:file,
  });
  if(listError||!objects?.some(o=>o.name===file))
    return {ok:false,message:"Image upload could not be verified."};
  const {data,error}=await w.client.from("products")
    .update({image_path:path}).eq("store_id",storeId).eq("id",productId).eq("is_published",false)
    .select("id").maybeSingle();
  if(error||!data)return {ok:false,message:"Image could not be attached to the draft."};
  revalidatePath("/supplier/catalog");
  return {ok:true,message:"Product image saved for private preview."};
}


// Reuse only an image attached to ANOTHER unpublished product in the SAME
// private store. Both product IDs are independently verified on the server.
export async function requestProductImageReuse(
  storeId:string,productId:string,sourceProductId:string,
):Promise<{ok:boolean;message:string;sourcePath?:string;path?:string;token?:string;mime?:string}> {
  if(process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED!=="true")
    return {ok:false,message:"Image management is disabled."};
  if(!idRe.test(storeId)||!idRe.test(productId)||
     !idRe.test(sourceProductId)||productId===sourceProductId)
    return {ok:false,message:"Select another private product image."};
  const w=await scopedProduct(storeId,productId);
  if(!w)return {ok:false,message:"Product image permission required."};

  const {data:source,error:sourceError}=await w.client.from("products")
    .select("image_path").eq("store_id",storeId)
    .eq("id",sourceProductId).eq("is_published",false).maybeSingle();
  const sourcePath=source?.image_path;
  const prefix=storeId+"/"+sourceProductId+"/";
  if(sourceError||typeof sourcePath!=="string"||
     !sourcePath.startsWith(prefix)||
     !imageFileRe.test(sourcePath.slice(prefix.length)))
    return {ok:false,message:"That existing image is no longer available."};

  const ext=sourcePath.slice(sourcePath.lastIndexOf(".")+1);
  const extToMime:Record<string,string>={jpg:"image/jpeg",png:"image/png",webp:"image/webp"};
  const mime=extToMime[ext];
  if(!mime)return {ok:false,message:"Unsupported source image."};

  // The image_path CHECK constraint requires each destination to have its
  // own product folder. Copy using a new signed insert, never an overwrite.
  const path=storeId+"/"+productId+"/"+randomUUID()+"."+ext;
  const {data,error}=await w.client.storage.from(bucket).createSignedUploadUrl(path);
  return error||!data?.token
    ? {ok:false,message:"Private image reuse is not available."}
    : {ok:true,message:"",sourcePath,path,token:data.token,mime};
}
