"use client";

import {useState} from "react";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {createBrowserClient} from "@supabase/ssr";
import {requestProductImageUpload,attachProductImage,requestProductImageReuse} from "./image-actions";

type ExistingImage={productId:string;name:string;sku:string;previewUrl:string};

export function ProductImageUploader({storeId,productId,enabled,existingImages=[]}:{
  storeId:string;productId:string;enabled:boolean;existingImages?:ExistingImage[];
}) {
  const router=useRouter();
  const [file,setFile]=useState<File|null>(null);
  const [mode,setMode]=useState<"upload"|"reuse">("upload");
  const [sourceProductId,setSourceProductId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  function browserStorage() {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url&&key?createBrowserClient(url,key).storage.from("apex-draft-product-images"):null;
  }
  async function upload() {
    if(!file||busy||!enabled)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||
       file.size<1||file.size>3145728) {
      setMessage("Choose a PNG, JPEG or WebP no larger than 3 MB.");return;
    }
    setBusy(true);setMessage("");
    try {
      const authorized=await requestProductImageUpload(storeId,productId,file.type,file.size);
      if(!authorized.ok||!authorized.path||!authorized.token) {
        setMessage(authorized.message);return;
      }
      const storage=browserStorage();
      if(!storage){setMessage("Preview storage is not configured.");return;}
      const {error}=await storage.uploadToSignedUrl(authorized.path,authorized.token,file,{
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
  async function reuse() {
    if(!sourceProductId||busy||!enabled||
       !existingImages.some(image=>image.productId===sourceProductId))return;
    setBusy(true);setMessage("");
    try {
      const authorized=await requestProductImageReuse(storeId,productId,sourceProductId);
      if(!authorized.ok||!authorized.sourcePath||!authorized.path||
         !authorized.token||!authorized.mime){
        setMessage(authorized.message);return;
      }
      const storage=browserStorage();
      if(!storage){setMessage("Preview storage is not configured.");return;}
      // Authenticated download is governed by the existing private object
      // SELECT policy; the destination is a new non-overwriting signed INSERT.
      const {data:source,error:readError}=await storage.download(authorized.sourcePath);
      if(readError||!source||source.size<1||source.size>3145728){
        setMessage("The selected image could not be read. Choose another.");return;
      }
      const {error:writeError}=await storage.uploadToSignedUrl(
        authorized.path,authorized.token,source,{contentType:authorized.mime,upsert:false},
      );
      if(writeError){setMessage("Could not reuse that image. Try again.");return;}
      const linked=await attachProductImage(storeId,productId,authorized.path);
      setMessage(linked.ok?"Existing image saved as a private copy for this product.":linked.message);
      if(linked.ok){setSourceProductId("");router.refresh();}
    } catch {
      setMessage("Existing image could not be reused.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="supplier-form apex-image-picker">
    <div className="apex-image-picker-tabs" role="group" aria-label="Image source">
      <button type="button" className="button secondary" aria-pressed={mode==="upload"}
        disabled={!enabled||busy} onClick={()=>{setMode("upload");setMessage("");}}>
        Upload new image
      </button>
      <button type="button" className="button secondary" aria-pressed={mode==="reuse"}
        disabled={!enabled||busy} onClick={()=>{setMode("reuse");setMessage("");}}>
        Choose existing image
      </button>
    </div>
    {mode==="upload"?<>
      <label htmlFor={"image-"+productId}>New image (PNG, JPEG, WebP up to 3 MB)</label>
      <input id={"image-"+productId} type="file" accept="image/png,image/jpeg,image/webp"
        disabled={!enabled||busy} onChange={e=>setFile(e.target.files?.[0]??null)}/>
      <button type="button" onClick={upload} className="button secondary"
        disabled={!file||!enabled||busy}>{busy?"Uploading…":"Upload image"}</button>
    </>:<>
      <p className="notice">Select an image from another draft product in this same supplier storefront. A separate private copy is saved to this product.</p>
      {existingImages.length===0
        ?<p className="notice">No reusable images yet. Upload an image to another private product first.</p>
        :<div className="apex-existing-image-grid" role="group" aria-label="Available saved images">
          {existingImages.map(image=><button type="button" key={image.productId}
            className="apex-existing-image-option"
            aria-pressed={sourceProductId===image.productId}
            disabled={!enabled||busy}
            onClick={()=>setSourceProductId(image.productId)}>
            <Image src={image.previewUrl} alt={image.name}
              width={144} height={108} unoptimized/>
            <span>{image.name}</span>
            <small>{image.sku}</small>
          </button>)}
        </div>}
      <button type="button" className="button secondary" onClick={reuse}
        disabled={!enabled||busy||!sourceProductId||
          !existingImages.some(image=>image.productId===sourceProductId)}>
        {busy?"Saving image…":"Use selected image"}
      </button>
    </>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
