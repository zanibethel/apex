"use client";

import {useActionState,useEffect,useRef} from "react";
import {useRouter} from "next/navigation";
import {submitProductForInternalReview} from "./review-actions";

export function SupplierReviewSubmission({storeId,productId,enabled}:{
 storeId:string;productId:string;enabled:boolean;
}) {
 const router=useRouter();
 const refreshed=useRef(false);
 const [state,action,pending]=useActionState(submitProductForInternalReview,{ok:false,message:""});
 useEffect(()=>{
  if(state.ok&&!refreshed.current){refreshed.current=true;router.refresh();}
 },[state.ok,router]);
 return <form action={action} className="apex-review-submit">
  <input type="hidden" name="storeId" value={storeId}/>
  <input type="hidden" name="productId" value={productId}/>
  <button type="submit" className="button primary" disabled={!enabled||pending}>
   {pending?"Submitting…":"Submit for internal review"}
  </button>
  <p className="notice">This requests a private admin content review only. It never publishes a product.</p>
  {state.message&&<p role="status">{state.message}</p>}
 </form>;
}
