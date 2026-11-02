import "server-only";

// PUBLIC read-only catalog projection. This is intentionally separate from
// private imports, inventory, supplier price costs and the demo checkout.
export type ApprovedSoldOutProduct={
 id:string;name:string;description:string;priceCents:number;
 currency:"USD";availability:"sold_out";canCheckout:false;
};
export type SoldOutCatalogResult={
 state:"disabled"|"unconfigured"|"unavailable"|"connected";
 products:ApprovedSoldOutProduct[];
};

const APEX_ORIGIN="https://fhqpkpztercadcxspdkg.supabase.co";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedKeys=["id","name","description","price_cents","currency","availability","can_checkout"];

export function parseApprovedSoldOutItems(raw:unknown):ApprovedSoldOutProduct[]|null{
 if(!Array.isArray(raw)||raw.length>24)return null;
 const ids=new Set<string>();
 const output:ApprovedSoldOutProduct[]=[];
 for(const item of raw){
  if(!item||typeof item!=="object"||Array.isArray(item))return null;
  const row=item as Record<string,unknown>;
  if(Object.keys(row).length!==allowedKeys.length||
   Object.keys(row).some(key=>!allowedKeys.includes(key))||
   typeof row.id!=="string"||!UUID.test(row.id)||ids.has(row.id)||
   typeof row.name!=="string"||row.name.trim().length===0||
   row.name.length>120||
   typeof row.description!=="string"||row.description.trim().length===0||
   row.description.length>1500||
   typeof row.price_cents!=="string"||!/^[1-9][0-9]{0,8}$/.test(row.price_cents)||
   row.currency!=="USD"||row.availability!=="sold_out"||
   row.can_checkout!==false)return null;
  ids.add(row.id);
  output.push(Object.freeze({
   id:row.id,name:row.name,description:row.description,
   priceCents:Number(row.price_cents),
   currency:"USD",availability:"sold_out",canCheckout:false,
  }));
 }
 return output;
}

export async function readApprovedSoldOutCatalog():Promise<SoldOutCatalogResult>{
 // A separate future migration and approval are required to turn on this
 // feed. Under the current SQL release check, the feed must return [].
 if(process.env.APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled")
  return {state:"disabled",products:[]};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return {state:"unconfigured",products:[]};
 if(url!==APEX_ORIGIN||!key.startsWith("sb_publishable_"))
  return {state:"unavailable",products:[]};
 try{
  const response=await fetch(new URL("/rest/v1/rpc/get_public_sold_out_catalog",url),{
   method:"GET",
   headers:{apikey:key,Accept:"application/json"},
   cache:"no-store",
   signal:AbortSignal.timeout(6000),
  });
  if(!response.ok)return {state:"unavailable",products:[]};
  const raw:unknown=await response.json();
  const products=parseApprovedSoldOutItems(raw);
  if(!products)return {state:"unavailable",products:[]};
  return {state:"connected",products};
 }catch{
  return {state:"unavailable",products:[]};
 }
}
