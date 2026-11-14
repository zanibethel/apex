"use client";

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode,type FormEvent} from "react";
import Link from "next/link";
import {
 CUSTOMER_CART_STORAGE_KEY,parseSavedCart,saveCartPayload,
 normalizeCartSelections,changeCartItem,cartCount,normalizeDiscountEntry,
} from "@/lib/cart/customer-cart.mjs";

export type CartItem={product_id:string;quantity:number};
type CartActions={
 items:CartItem[];count:number;ready:boolean;
 discountCode:string;setDiscountCode:(value:string)=>void;
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
 const [discountCode,setDiscountCode]=useState("");
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
 return <Context.Provider value={{items,count,ready,discountCode,setDiscountCode,add,setQuantity,remove,clear}}>
  {children}
 </Context.Provider>;
}
type MiniQuoteLine={productId:string;name:string;quantity:number;
 unitPriceCents:number;lineTotalCents:number;
 availability:"in_stock"|"sold_out"|"insufficient_stock"};
type MiniQuote={ok:boolean;reason?:string;status?:string;
 items?:MiniQuoteLine[];merchandiseSubtotalCents?:number;
 merchandiseDiscountCents?:number;shippingCents?:number;
 totalCents?:number;canPlaceOrder?:false;canPay?:false};
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

// The header cart only previews a fresh server-authoritative, nonpayable quote.
// All product prices, shipping and stock come from /api/cart/quote, not local data.
export function CustomerCartLink(){
 const {items,count,ready,discountCode,setDiscountCode,
  setQuantity,remove}=useCustomerCart();
 const [open,setOpen]=useState(false);
 const [enteredCode,setEnteredCode]=useState("");
 const [codeError,setCodeError]=useState("");
 const [revision,setRevision]=useState(0);
 const [response,setResponse]=useState<{key:string;quote:MiniQuote}|null>(null);
 const root=useRef<HTMLDivElement>(null);
 const key=useMemo(()=>JSON.stringify({items,code:discountCode,revision}),
  [items,discountCode,revision]);
 const quote=response?.key===key?response.quote:null;
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{
   if(root.current&&!root.current.contains(event.target as Node))setOpen(false);
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){setOpen(false);root.current?.querySelector("button")?.focus();}
  };
  document.addEventListener("pointerdown",outside);
  document.addEventListener("keydown",escape);
  return ()=>{
   document.removeEventListener("pointerdown",outside);
   document.removeEventListener("keydown",escape);
  };
 },[open]);
 useEffect(()=>{
  if(!open||!ready||items.length===0)return;
  const controller=new AbortController();
  fetch("/api/cart/quote",{
   method:"POST",cache:"no-store",signal:controller.signal,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({items,code:discountCode,boxSize:"auto"}),
  }).then(async result=>{
   const data:MiniQuote=await result.json();
   if(!controller.signal.aborted)setResponse({key,quote:data});
  }).catch(()=>{
   if(!controller.signal.aborted)setResponse({key,quote:{
    ok:false,reason:"Cart verification is unavailable. Recheck before continuing.",
   }});
  });
  return ()=>controller.abort();
 },[open,ready,key,items,discountCode]);
 const applyCode=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const normalized=normalizeDiscountEntry(enteredCode);
  if(normalized===null){
   setCodeError("Use 3–24 letters, numbers, dashes or underscores.");
   return;
  }
  setCodeError("");
  setDiscountCode(normalized);
  setRevision(current=>current+1);
 };
 const clearCode=()=>{
  setEnteredCode("");
  setDiscountCode("");
  setCodeError("");
  setRevision(current=>current+1);
 };
 const lines=quote?.ok?quote.items??[]:[];
 const missingStock=quote?.ok&&lines.some(line=>line.availability!=="in_stock");
 return <div className="apex-mini-cart-root" ref={root}>
  <button type="button" className="apex-cart-toggle apex-customer-cart-link"
   aria-label={"Shopping cart, "+count+" items"}
   aria-expanded={open} aria-haspopup="dialog" aria-controls="apex-mini-cart-panel"
   onClick={()=>{setOpen(current=>!current);setRevision(current=>current+1);}}>
   <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h2l2.6 11.1c.2.8.9 1.4 1.8 1.4h9.2c.8 0 1.5-.5 1.7-1.2L22 8H6"/>
    <circle cx="10" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>
   </svg>
   {count>0&&<span className="apex-customer-cart-count">{count}</span>}
  </button>
  {open&&<section id="apex-mini-cart-panel" className="apex-mini-cart-panel"
   role="dialog" aria-modal="false" aria-label="Shopping cart summary">
   <div className="apex-mini-cart-head">
    <h2>My cart <span>({count})</span></h2>
    <button type="button" aria-label="Close cart" onClick={()=>setOpen(false)}>×</button>
   </div>
   {!ready?<p className="apex-mini-cart-muted" role="status">Loading cart…</p>:
    items.length===0?<p className="apex-mini-cart-muted">Your cart is empty.
     Browse products to add an item.</p>:
    <>
     <div className="apex-mini-cart-lines">
      {items.map(item=>{
       const line=lines.find(value=>value.productId===item.product_id);
       return <div key={item.product_id} className="apex-mini-cart-line">
        <div className="apex-mini-cart-line-main">
         <strong>{line?.name??"Saved product"}</strong>
         <span>{line?money(line.lineTotalCents):"Verifying price…"}
          {" · Qty "+item.quantity}</span>
         {line&&line.availability!=="in_stock"&&
          <small role="alert">Out of stock or insufficient quantity — cannot order</small>}
        </div>
        <div className="apex-mini-cart-line-actions">
         <button type="button" aria-label="Decrease quantity" onClick={()=>
          setQuantity(item.product_id,item.quantity-1)}>−</button>
         <button type="button" aria-label="Increase quantity"
          disabled={item.quantity>=10||count>=50}
          onClick={()=>setQuantity(item.product_id,item.quantity+1)}>+</button>
         <button type="button" className="apex-mini-cart-remove"
          onClick={()=>remove(item.product_id)}>Remove</button>
        </div>
       </div>;
      })}
     </div>
     <form className="apex-mini-cart-discount" onSubmit={applyCode}>
      <label htmlFor="apex-mini-discount">Discount code (optional)</label>
      <div>
       <input id="apex-mini-discount" type="text" maxLength={24}
        value={enteredCode} placeholder="Enter code" autoCapitalize="characters"
        autoCorrect="off" autoComplete="off" spellCheck={false}
        aria-invalid={Boolean(codeError)}
        aria-describedby={codeError?"apex-mini-discount-error":undefined}
        onChange={event=>{setEnteredCode(event.target.value);setCodeError("");}}/>
       <button type="submit">Apply</button>
      </div>
      {codeError&&<p role="alert" id="apex-mini-discount-error">{codeError}</p>}
      {discountCode&&<div className="apex-mini-applied">
       <span>Applied: <strong>{discountCode}</strong></span>
       <button type="button" onClick={clearCode}>Remove code</button>
      </div>}
     </form>
     {!quote?<p role="status" className="apex-mini-cart-muted">Checking current stock and prices…</p>:
      !quote.ok?<p role="alert" className="apex-mini-cart-error">
       {quote.reason??"Unable to verify cart totals."}</p>:
      <div className="apex-mini-cart-totals" aria-live="polite">
       <div><span>Merchandise</span><strong>{money(quote.merchandiseSubtotalCents??0)}</strong></div>
       <div><span>Discount</span><strong>−{money(quote.merchandiseDiscountCents??0)}</strong></div>
       <div><span>Shipping</span><strong>{quote.shippingCents===0?"Free":money(quote.shippingCents??0)}</strong></div>
       <div className="apex-mini-cart-total"><span>Estimated total</span>
        <strong>{money(quote.totalCents??0)}</strong></div>
       {missingStock&&<p role="alert" className="apex-mini-cart-error">
        One or more items are out of stock. Review quantities on the checkout page.</p>}
      </div>}
     <Link href="/checkout" className="apex-mini-cart-checkout"
      onClick={()=>setOpen(false)}>Checkout</Link>
     <p className="apex-mini-cart-muted">Review only. Orders and payments are not yet available.</p>
    </>}
  </section>}
 </div>;
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
