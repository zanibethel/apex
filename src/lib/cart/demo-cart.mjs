import {DEMO_ITEMS,normalizeDemoQuantity} from "../checkout/preview-model.mjs";

// This cart contains ONLY the two fictional demo merchandise SKUs.
// Never accept catalog/database product IDs or externally supplied prices.
export const DEMO_CART_STORAGE_KEY="apex_demo_cart_v1";
export const DEMO_CART_VERSION=1;
export const EMPTY_DEMO_CART=Object.freeze(
 Object.fromEntries(DEMO_ITEMS.map(item=>[item.id,0]))
);

export function normalizeDemoCart(value){
 const quantities={...EMPTY_DEMO_CART};
 if(!value||typeof value!=="object"||Array.isArray(value))return quantities;
 for(const item of DEMO_ITEMS){
  const raw=Object.hasOwn(value,item.id)?value[item.id]:0;
  if(typeof raw==="number"&&Number.isInteger(raw)&&raw>=0&&raw<=5)
   quantities[item.id]=raw;
 }
 return quantities;
}
export function changeDemoCartQuantity(value,id,quantity){
 const current=normalizeDemoCart(value);
 if(!DEMO_ITEMS.some(item=>item.id===id))return current;
 current[id]=normalizeDemoQuantity(quantity);
 return current;
}
export function demoCartCount(value){
 const cart=normalizeDemoCart(value);
 return DEMO_ITEMS.reduce((sum,item)=>sum+cart[item.id],0);
}
export function demoCartSubtotal(value){
 const cart=normalizeDemoCart(value);
 return DEMO_ITEMS.reduce((sum,item)=>sum+cart[item.id]*item.unitCents,0);
}
export function serializeDemoCart(value){
 return JSON.stringify({version:DEMO_CART_VERSION,quantities:normalizeDemoCart(value)});
}
export function parseDemoCart(raw){
 if(typeof raw!=="string"||raw.length>500)return {...EMPTY_DEMO_CART};
 try{
  const data=JSON.parse(raw);
  if(data?.version!==DEMO_CART_VERSION||
   !data.quantities||typeof data.quantities!=="object"||
   Array.isArray(data.quantities))return {...EMPTY_DEMO_CART};
  if(Object.keys(data.quantities).some(id=>!DEMO_ITEMS.some(item=>item.id===id)))
   return {...EMPTY_DEMO_CART};
  return normalizeDemoCart(data.quantities);
 }catch{return {...EMPTY_DEMO_CART};}
}
