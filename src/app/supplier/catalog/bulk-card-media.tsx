"use client";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {useState,useTransition} from "react";
import {adjustInventory,setPrivateStockPreference} from "../operations/actions";
import {ProductImageUploader} from "./image-uploader";

export type BulkSavedImage={
 productId:string;name:string;sku:string;previewUrl:string;
};
export type BulkSavedMedia={
 productId:string;imageUrl?:string;quantityOnHand?:number;quantityReserved?:number;
 trackQuantities?:boolean;
};

export function BulkCardMedia({storeId,productId,enabled,imageUrl,existingImages,
 quantityOnHand,quantityReserved,trackQuantities=true}:{
 storeId:string;productId:string;enabled:boolean;imageUrl?:string;
 existingImages:BulkSavedImage[];quantityOnHand?:number;quantityReserved?:number;
 trackQuantities?:boolean;
}){
 const [imageOpen,setImageOpen]=useState(false);
 const [stock,setStock]=useState(quantityOnHand==null?"":String(quantityOnHand));
 const [persisted,setPersisted]=useState(quantityOnHand);
 const [message,setMessage]=useState("");
 const [tracked,setTracked]=useState(trackQuantities);
 const [pending,startTransition]=useTransition();
 const router=useRouter();
 const stockTracked=Number.isSafeInteger(quantityOnHand)&&
   Number.isSafeInteger(quantityReserved);
 function setTrackingPreference(next:boolean){
  if(!enabled||pending||next===tracked)return;
  startTransition(async()=>{
   const form=new FormData();
   form.set("storeId",storeId);form.set("productId",productId);
   form.set("expectedTracking",String(tracked));
   form.set("trackQuantities",String(next));
   try{
    const result=await setPrivateStockPreference({ok:false,message:""},form);
    setMessage(result.message);
    if(result.ok){setTracked(next);router.refresh();}
   }catch{setMessage("Tracking preference was not saved. Refresh and retry.");}
  });
 }
 function saveStock(){
  if(!enabled||pending||!tracked||persisted===undefined||!stockTracked)return;
  const quantity=Number(stock);
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000){
   setMessage("Enter an integer from 0 to 1,000,000.");return;
  }
  if(quantity===persisted){setMessage("Inventory is unchanged.");return;}
  startTransition(async()=>{
   const form=new FormData();
   form.set("storeId",storeId);form.set("productId",productId);
   form.set("expectedOnHand",String(persisted));
   form.set("quantityOnHand",String(quantity));
   try{
    const result=await adjustInventory({ok:false,message:""},form);
    setMessage(result.message);
    if(result.ok){setPersisted(quantity);router.refresh();}
   }catch{setMessage("Stock was not saved. Refresh and check current quantity.");}
  });
 }
 return <section className="apex-bulk-card-media" aria-label="Image and inventory">
  <div className="apex-bulk-media-photo">
   {imageUrl?<Image src={imageUrl} alt="Saved private product image"
    width={160} height={120} unoptimized style={{objectFit:"contain",width:"100%",height:"100%"}}/>
    :<span>No image yet</span>}
  </div>
  <div className="apex-bulk-media-main">
   <button type="button" className="button secondary"
    aria-expanded={imageOpen} aria-controls={"image-controls-"+productId}
    onClick={()=>setImageOpen(open=>!open)}
    disabled={!enabled}>
    {imageOpen?"Close image editor":imageUrl?"Change image":"Add image"}
   </button>
   <div className="apex-bulk-stock-editor">
    <label className="apex-bulk-stock-mode" htmlFor={"bulk-track-"+productId}>
     <input id={"bulk-track-"+productId} type="checkbox"
      checked={tracked} disabled={!enabled||pending}
      onChange={e=>setTrackingPreference(e.target.checked)}/>
     Track inventory quantities
    </label>
    {!tracked?<small role="status">Quantity counts are hidden for this private draft.
     Existing inventory is preserved; verified stock and product authorization are
     still required before public purchasing.</small>:<>
    <label htmlFor={"bulk-stock-"+productId}>On-hand stock</label>
    <input id={"bulk-stock-"+productId} type="number" min="0" max="1000000"
     step="1" value={stock} onChange={e=>setStock(e.target.value)}
     disabled={!enabled||pending||!tracked||!stockTracked}/>
    <button type="button" className="button secondary"
     disabled={!enabled||pending||!tracked||!stockTracked||stock===""}
     onClick={saveStock}>{pending?"Saving stock…":"Save stock"}</button>
    {stockTracked&&<small>Reserved: {quantityReserved} · Available: {Math.max(0,(persisted??0)-(quantityReserved??0))}</small>}
    {!stockTracked&&<small>Inventory record unavailable. Check the product in Inventory before changing stock.</small>}
    </>}
    {message&&<small role="status">{message}</small>}
   </div>
  </div>
  {imageOpen&&<div id={"image-controls-"+productId} className="apex-bulk-image-controls">
   <ProductImageUploader storeId={storeId} productId={productId}
    enabled={enabled} hasImage={Boolean(imageUrl)}
    existingImages={existingImages.filter(image=>image.productId!==productId)}/>
  </div>}
 </section>;
}
