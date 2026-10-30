"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {createBrowserClient} from "@supabase/ssr";
import {requestProductImageUpload,attachProductImage} from "./image-actions";

export function ProductImageUploader({storeId,productId,enabled}:{
  storeId:string;productId:string;enabled:boolean;
}) {
  const router=useRouter();
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function upload() {
    if(!file||busy||!enabled)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||
       file.size<1||file.size>3145728) {
      setMessage("Choose a PNG, JPEG or WebP smaller than 3 MB."); return;
    }
    setBusy(true);setMessage("");
    try {
      const authorized=await requestProductImageUpload(storeId,productId,file.type,file.size);
      if(!authorized.ok||!authorized.path||!authorized.token) {
        setMessage(authorized.message);return;
      }
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if(!url||!key){setMessage("Preview storage is not configured.");return;}
      const client=createBrowserClient(url,key);
      const {error}=await client.storage.from("apex-draft-product-images")
        .uploadToSignedUrl(authorized.path,authorized.token,file,{
          contentType:file.type,upsert:false,
        });
      if(error){setMessage("Image upload failed. Try another image.");return;}
      const linked=await attachProductImage(storeId,productId,authorized.path);
      setMessage(linked.message);
      if(linked.ok){setFile(null);router.refresh();}
    } catch {
      setMessage("Image upload could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="supplier-form" style={{marginTop:10}}>
    <label htmlFor={`image-${productId}`}>Product image (PNG, JPEG, WebP up to 3 MB)</label>
    <input id={`image-${productId}`} type="file" accept="image/png,image/jpeg,image/webp"
      disabled={!enabled||busy} onChange={e=>setFile(e.target.files?.[0]??null)}/>
    <button type="button" onClick={upload} className="button secondary"
      disabled={!file||!enabled||busy}>{busy?"Uploading…":"Upload image"}</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}
