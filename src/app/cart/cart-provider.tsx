"use client";

import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import Link from "next/link";
import {
 CUSTOMER_CART_STORAGE_KEY,parseSavedCart,saveCartPayload,
 normalizeCartSelections,changeCartItem,cartCount,
} from "@/lib/cart/customer-cart.mjs";

export type CartItem={product_id:string;quantity:number};
type CartActions={
 items:CartItem[];count:number;ready:boolean;
 add:(id:string)=>void;setQuantity:(id:string,quantity:number)=>void;
 remove:(id:string)=>void;clear:()=>void;
};
const Context=createContext<CartActions|null>(null);
export function useCustomerCart(){
 const ctx=useContext(Context);
 if(!ctx)throw Error("CustomerCartProvider missing");
 return ctx;
}
export function CustomerCartProvider({children}:{children:ReactNode}){
 const [items,setItems]=useState<CartItem[]>([]);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const frame=window.requestAnimationFrame(()=>{
   try{setItems(parseSavedCart(window.localStorage.getItem(CUSTOMER_CART_STORAGE_KEY)));}
   catch{setItems([]);}
   setReady(true);
  });
  return ()=>window.cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{
  if(!ready)return;
  try{window.localStorage.setItem(CUSTOMER_CART_STORAGE_KEY,saveCartPayload(items));}
  catch{/* Local-only cart still works with storage disabled. */}
 },[items,ready]);
 const add=useCallback((id:string)=>{
  setItems(current=>{
   const existing=current.find(item=>item.product_id===id);
   return changeCartItem(current,id,Math.min(10,(existing?.quantity??0)+1));
  });
 },[]);
 const setQuantity=useCallback((id:string,qty:number)=>{
  setItems(current=>changeCartItem(current,id,qty));
 },[]);
 const remove=useCallback((id:string)=>setItems(current=>changeCartItem(current,id,0)),[]);
 const clear=useCallback(()=>setItems([]),[]);
 const count=cartCount(normalizeCartSelections(items));
 return <Context.Provider value={{items,count,ready,add,setQuantity,remove,clear}}>
  {children}
 </Context.Provider>;
}
export function CustomerCartLink(){
 const {count}=useCustomerCart();
 return <Link href="/cart" className="apex-customer-cart-link"
   aria-label={`Shopping cart, ${count} items`}>
   <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h2l2.6 11.1c.2.8.9 1.4 1.8 1.4h9.2c.8 0 1.5-.5 1.7-1.2L22 8H6"/>
    <circle cx="10" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>
   </svg>
   {count>0&&<span className="apex-customer-cart-count">{count}</span>}
  </Link>;
}
export function SaveCatalogItem({id,name,actionLabel="Save to cart"}:{id:string;name:string;actionLabel?:string}){
 const {items,add}=useCustomerCart();
 const saved=items.some(item=>item.product_id===id);
 return <button type="button" className="apex-approved-save"
   onClick={()=>add(id)} disabled={saved&&items.find(item=>item.product_id===id)?.quantity===10}
   aria-label={`Save ${name} to cart`}>
  {saved?"In cart — add another":"+ "+actionLabel}
 </button>;
}
