"use client";

import Image from "next/image";
import {useEffect,useRef,useState} from "react";
import {ProductImageUploader} from "./image-uploader";
import type {BulkSavedImage} from "./bulk-card-media";

// The thumbnail is a shortcut only. The existing authenticated uploader
// continues to enforce store ownership, private-draft state and signed storage.
export function QuickProductImagePicker({storeId,productId,productName,imageUrl,existingImages,
 enabled,needsSave}:{storeId:string;productId?:string;productName:string;imageUrl?:string;
 existingImages:BulkSavedImage[];enabled:boolean;needsSave:boolean;}){
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLDivElement>(null);
 const canEdit=Boolean(productId)&&!needsSave;
 useEffect(()=>{
  if(!open)return;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  dialog.current?.querySelector<HTMLButtonElement>(".apex-quick-image-close")?.focus();
  function onKeyDown(e:KeyboardEvent){
   if(e.key==="Escape"){e.preventDefault();setOpen(false);return;}
   if(e.key!=="Tab")return;
   const controls=dialog.current?.querySelectorAll<HTMLElement>(
    'button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],textarea:not([disabled])');
   if(!controls?.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  document.addEventListener("keydown",onKeyDown);
  return ()=>{
   document.removeEventListener("keydown",onKeyDown);
   document.body.style.overflow=oldOverflow;
   trigger.current?.focus();
  };
 },[open]);
 return <>
  <button ref={trigger} type="button" className="apex-supplier-row-thumbnail apex-quick-image-trigger"
   disabled={!enabled} aria-haspopup="dialog" aria-expanded={open}
   aria-label={(imageUrl?"Replace image for ":"Add image to ")+productName}
   title={imageUrl?"Replace product photo":"Add product photo"}
   onClick={()=>setOpen(true)}>
   {imageUrl?<><Image src={imageUrl} alt="" width={64} height={64} unoptimized/>
    <span className="apex-quick-image-edit-mark" aria-hidden="true">+</span></>
    :<span aria-hidden="true">+</span>}
  </button>
  {open&&<div className="apex-quick-image-backdrop" onMouseDown={e=>{
   if(e.target===e.currentTarget)setOpen(false);
  }}>
   <div ref={dialog} className="apex-quick-image-dialog" role="dialog" aria-modal="true"
    aria-labelledby={"quick-image-title-"+(productId??"draft")}>
    <div className="apex-quick-image-header">
     <div>
      <h3 id={"quick-image-title-"+(productId??"draft")}>
       {imageUrl?"Replace image":"Add image"}
      </h3>
      <p>{productName}</p>
     </div>
     <button type="button" className="apex-quick-image-close"
      aria-label="Close image picker" onClick={()=>setOpen(false)}>×</button>
    </div>
    {canEdit&&productId
     ?<ProductImageUploader storeId={storeId} productId={productId}
       enabled={enabled} hasImage={Boolean(imageUrl)}
       existingImages={existingImages.filter(image=>image.productId!==productId)}
       onSaved={()=>setOpen(false)}/>
     :<p role="status" className="notice">
       Save this product and any unsaved edits first, then tap its image tile to upload or reuse a photo.
      </p>}
   </div>
  </div>}
 </>;
}
