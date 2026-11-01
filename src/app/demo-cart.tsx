"use client";

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import Link from "next/link";
import {DEMO_ITEMS,formatDemoUsd} from "@/lib/checkout/preview-model.mjs";
import {
 EMPTY_DEMO_CART,DEMO_CART_STORAGE_KEY,parseDemoCart,serializeDemoCart,
 normalizeDemoCart,changeDemoCartQuantity,demoCartCount,demoCartSubtotal,
} from "@/lib/cart/demo-cart.mjs";

type Quantities=Record<string,number>;
type DemoCartContextValue={
 quantities:Quantities;count:number;subtotal:number;
 add:(id:string)=>void;setQuantity:(id:string,quantity:number)=>void;
 remove:(id:string)=>void;clear:()=>void;open:()=>void;
};
const CartContext=createContext<DemoCartContextValue|null>(null);
export function useDemoCart(){
 const context=useContext(CartContext);
 if(!context)throw Error("DemoCartProvider missing");
 return context;
}

export function DemoCartProvider({children,enabled}:{children:ReactNode;enabled:boolean}){
 const [quantities,setQuantities]=useState<Quantities>({...EMPTY_DEMO_CART});
 const [ready,setReady]=useState(false);
 const [drawerOpen,setDrawerOpen]=useState(false);
 const drawerRef=useRef<HTMLElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);

 useEffect(()=>{
  if(!enabled)return;
  // Read persisted demo-only quantities after hydration to preserve SSR markup.
  // A cancellable browser frame avoids synchronous setState in effects.
  const frame=window.requestAnimationFrame(()=>{
   try{setQuantities(parseDemoCart(window.localStorage.getItem(DEMO_CART_STORAGE_KEY)));}
   catch{setQuantities({...EMPTY_DEMO_CART});}
   setReady(true);
  });
  return ()=>window.cancelAnimationFrame(frame);
 },[enabled]);
 useEffect(()=>{
  if(!enabled||!ready)return;
  try{window.localStorage.setItem(DEMO_CART_STORAGE_KEY,serializeDemoCart(quantities));}
  catch{/* Storage may be unavailable in private mode; in-memory cart still works. */}
 },[enabled,quantities,ready]);
 useEffect(()=>{
  if(!drawerOpen)return;
  const prev=document.body.style.overflow;
  document.body.style.overflow="hidden";
  closeRef.current?.focus({preventScroll:true});
  const handleKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){
    event.preventDefault();
    setDrawerOpen(false);
    triggerRef.current?.focus({preventScroll:true});
   }
   if(event.key!=="Tab"||!drawerRef.current)return;
   const controls=Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled])'
   ));
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
   }
  };
  document.addEventListener("keydown",handleKey);
  return ()=>{
   document.body.style.overflow=prev;
   document.removeEventListener("keydown",handleKey);
  };
 },[drawerOpen]);

 const setQuantity=useCallback((id:string,quantity:number)=>{
  if(!enabled)return;
  setQuantities(current=>changeDemoCartQuantity(current,id,quantity));
 },[enabled]);
 const add=useCallback((id:string)=>{
  if(!enabled||!DEMO_ITEMS.some(item=>item.id===id))return;
  setQuantities(current=>{
   const cart=normalizeDemoCart(current);
   return changeDemoCartQuantity(cart,id,(cart[id]??0)+1);
  });
 },[enabled]);
 const clear=useCallback(()=>{
  if(enabled)setQuantities({...EMPTY_DEMO_CART});
 },[enabled]);
 const remove=useCallback((id:string)=>setQuantity(id,0),[setQuantity]);
 const close=useCallback(()=>{
  setDrawerOpen(false);
  triggerRef.current?.focus({preventScroll:true});
 },[]);
 const count=demoCartCount(quantities);
 const subtotal=demoCartSubtotal(quantities);
 const value:DemoCartContextValue={
  quantities,count,subtotal,add,setQuantity,remove,clear,open:()=>setDrawerOpen(true),
 };
 return <CartContext.Provider value={value}>
  {children}
  {enabled&&drawerOpen&&<div className="apex-cart-overlay">
   <button type="button" className="apex-cart-backdrop"
    aria-label="Close demo cart" onClick={close}/>
   <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="apex-cart-title"
    className="apex-cart-drawer">
    <div className="apex-cart-head">
     <div><p className="apex-cart-kicker">TEST MODE · NO PURCHASES</p>
      <h2 id="apex-cart-title">Your cart <span>({count})</span></h2></div>
     <button ref={closeRef} type="button" className="apex-cart-close"
      aria-label="Close cart" onClick={close}>✕</button>
    </div>
    <p className="apex-cart-notice">Fictional sample items only. Cart data is stored on this device; no orders or payments are created.</p>
    <div className="apex-cart-lineitems">
     {DEMO_ITEMS.filter(item=>(quantities[item.id]??0)>0).map(item=>{
      const qty=quantities[item.id]??0;
      return <article key={item.id} className="apex-cart-line">
       <div className="apex-cart-art" aria-hidden="true">{item.id==="demo-shirt"?"A":"▲"}</div>
       <div className="apex-cart-item-detail">
        <strong>{item.name}</strong>
        <span>{item.category}</span>
        <div className="apex-cart-qty">
         <button type="button" aria-label={"Remove one "+item.name} onClick={()=>setQuantity(item.id,qty-1)}>−</button>
         <output aria-label={"Quantity of "+item.name}>{qty}</output>
         <button type="button" disabled={qty>=5} aria-label={"Add one "+item.name}
          onClick={()=>setQuantity(item.id,qty+1)}>+</button>
        </div>
        <button type="button" className="apex-cart-remove" onClick={()=>remove(item.id)}>
         Remove item
        </button>
       </div>
       <b>{formatDemoUsd(item.unitCents*qty)}</b>
      </article>;
     })}
     {count===0&&<div className="apex-cart-empty">
      <span aria-hidden="true">◫</span>
      <h3>Your cart is empty</h3>
      <p>Add a fictional sample item from the catalog to test the experience.</p>
      <Link href="/catalog" onClick={close}>Explore demo items</Link>
     </div>}
    </div>
    <div className="apex-cart-footer">
     <div className="apex-cart-subtotal"><span>Sample subtotal</span><strong>{formatDemoUsd(subtotal)}</strong></div>
     <p>Shipping and the sample discount are calculated in the demo checkout. Tax is not calculated.</p>
     {count>0?<Link className="apex-cart-checkout" href="/checkout/preview" onClick={close}>
      Continue to demo checkout <span aria-hidden="true">→</span>
     </Link>:<button className="apex-cart-checkout" type="button" disabled>Demo checkout · cart empty</button>}
     <div className="apex-cart-footer-actions">
      <Link href="/catalog" onClick={close}>Continue shopping</Link>
      {count>0&&<button type="button" onClick={clear}>Clear cart</button>}
     </div>
    </div>
   </aside>
  </div>}
 </CartContext.Provider>;
}

export function DemoCartToggle(){
 const cart=useDemoCart();
 return <button type="button" className="apex-cart-toggle"
  aria-label={"Open demo shopping cart, "+cart.count+" items"}
  aria-haspopup="dialog" aria-expanded={false}
  onClick={cart.open}>
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
   <path d="M3 4h2l2.6 11.1c.2.8.9 1.4 1.8 1.4h9.2c.8 0 1.5-.5 1.7-1.2L22 8H6"/>
   <circle cx="10" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>
  </svg>
  {cart.count>0&&<span className="apex-cart-count">{cart.count}</span>}
 </button>;
}
