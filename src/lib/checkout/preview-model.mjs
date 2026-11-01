import {resolveDemoState} from "./us-states.mjs";

/**
 * Static, non-transactional checkout model. Deliberately contains NO actual
 * products, addresses, payment links, API calls, persistence or FX quotes.
 */
export const DEMO_ITEMS=Object.freeze([
 Object.freeze({id:"demo-shirt",name:"Apex Demo Shirt",category:"Sample apparel",unitCents:3400,compareCents:4200}),
 Object.freeze({id:"demo-bottle",name:"Apex Demo Bottle",category:"Sample accessory",unitCents:1900,compareCents:null}),
]);
export const DEMO_SHIPPING=Object.freeze({
 standard:Object.freeze({label:"Standard shipping",detail:"Sample delivery: 4–6 business days",cents:600}),
 express:Object.freeze({label:"Express shipping",detail:"Sample delivery: 1–2 business days",cents:1400}),
});
export const DEMO_RATE_CENTS=10000000; // fictional $100,000/BTC, never a quote

export function normalizeDemoQuantity(value){
 const n=Number(value);
 if(!Number.isInteger(n))return 0;
 return Math.max(0,Math.min(5,n));
}
export function applyDemoCoupon(raw){
 const code=String(raw??"").trim().toUpperCase();
 return code==="DEMO10"?{accepted:true,code:"DEMO10"}:
  code===""?{accepted:false,code:"",error:"Enter a sample discount code."}:
  {accepted:false,code:"",error:"Demo code not recognized. Try DEMO10."};
}
/** @param {{quantities?: Record<string, number>, shipping?: "standard" | "express", coupon?: string}} [options] */
export function demoTotals({
 quantities={"demo-shirt":1,"demo-bottle":1},
 shipping="standard",coupon="",
}={}){
 const items=DEMO_ITEMS.map(item=>({
   ...item,quantity:normalizeDemoQuantity(quantities?.[item.id]),
 })).filter(item=>item.quantity>0);
 const subtotalCents=items.reduce((sum,item)=>sum+item.unitCents*item.quantity,0);
 const discountCents=coupon==="DEMO10"?Math.floor(subtotalCents/10):0;
 const shippingCents=subtotalCents>0?
   (DEMO_SHIPPING[shipping]?.cents??DEMO_SHIPPING.standard.cents):0;
 // Tax is intentionally not computed; do not label it as real zero tax.
 const totalCents=subtotalCents-discountCents+shippingCents;
 const mockSats=totalCents>0?
  (BigInt(totalCents)*100000000n+BigInt(DEMO_RATE_CENTS)-1n)/
   BigInt(DEMO_RATE_CENTS):0n;
 return {items,subtotalCents,discountCents,shippingCents,totalCents,
   taxLabel:"Not calculated in demo",mockSats:mockSats.toString()};
}
export function formatDemoUsd(cents){
 if(!Number.isSafeInteger(cents)||cents<0)return "$—";
 return new Intl.NumberFormat("en-US",{
   style:"currency",currency:"USD",
 }).format(cents/100);
}
export function formatDemoBtc(satString){
 if(typeof satString!=="string"||!/^[0-9]+$/.test(satString))return "—";
 const sats=BigInt(satString);
 return (sats/100000000n).toString()+"."+
  (sats%100000000n).toString().padStart(8,"0")+" BTC";
}
export function validateDemoGuest(values={}){
 const errors={};
 const required=["firstName","lastName","street","city"];
 for(const key of required){
  if(typeof values[key]!=="string"||values[key].trim().length<2)
   errors[key]="Enter a sample "+({firstName:"first name",lastName:"last name",
     street:"street address",city:"city"}[key])+".";
 }
 const email=String(values.email??"").trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  errors.email="Enter a valid-looking sample email.";
 if(!resolveDemoState(values.state))
  errors.state="Select a valid state from the list.";
 if(!/^\d{5}(?:-\d{4})?$/.test(String(values.postal??"").trim()))
  errors.postal="Enter a 5-digit sample ZIP code.";
 const phone=String(values.phone??"").trim();
 if(phone&&!/^\+?[0-9() .-]{7,20}$/.test(phone))
  errors.phone="Enter a valid-looking sample phone or leave blank.";
 return errors;
}
