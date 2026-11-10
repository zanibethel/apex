"use client";
import {useState} from "react";
import Image from "next/image";

// Public read path contains ONLY a released product UUID. The server endpoint
// validates two independent release gates, current evidence, authorizations,
// immutable version and SHA-256 before returning private-backed image bytes.
export function ApprovedProductMedia({productId,availability,retailShowcase=false}:{
 productId:string;availability:"in_stock"|"sold_out";retailShowcase?:boolean;
}){
 const [failed,setFailed]=useState(false);
 return <div className="apex-approved-art">
  <span className="apex-approved-triangle" aria-hidden="true">▲</span>
  {!failed&&!retailShowcase&&<Image unoptimized width={640} height={480}
   src={"/api/catalog/media/v1/"+productId}
   alt="Reviewed product image" loading="lazy"
   className="apex-approved-photo" onError={()=>setFailed(true)}/>}
  <span className={"apex-approved-badge"+(availability==="in_stock"?" apex-approved-instock":"")}>
   {availability==="in_stock"?"IN STOCK":"SOLD OUT"}
  </span>
  <small>{retailShowcase?"RETAIL SHOWCASE · NO CHECKOUT":"APEX ANABOLICS"}</small>
 </div>;
}
