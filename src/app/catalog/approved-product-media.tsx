"use client";
import {useState} from "react";
import Image from "next/image";

// The retail gallery renders the product's saved image as soon as its supplier
// publishes it. Both image routes use a product UUID only, with a no-cache
// server proxy. Unpublished/held products cannot expose their private images.
export function ApprovedProductMedia({productId,availability,retailShowcase=false}:{
 productId:string;availability:"in_stock"|"sold_out";retailShowcase?:boolean;
}){
 const [failed,setFailed]=useState(false);
 return <div className="apex-approved-art">
  <span className="apex-approved-triangle" aria-hidden="true">▲</span>
  {!failed&&<Image unoptimized width={640} height={480}
   src={(retailShowcase?"/api/catalog/retail-media/v1/":"/api/catalog/media/v1/")+productId}
   alt="Product image" loading="lazy"
   className="apex-approved-photo" onError={()=>setFailed(true)}/>}
  <span className={"apex-approved-badge"+(availability==="in_stock"?" apex-approved-instock":"")}>
   {availability==="in_stock"?"IN STOCK":"SOLD OUT"}
  </span>
  <small>{retailShowcase?"RETAIL SHOWCASE · NO CHECKOUT":"APEX ANABOLICS"}</small>
 </div>;
}
