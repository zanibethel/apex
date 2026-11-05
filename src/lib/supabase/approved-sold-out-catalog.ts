import "server-only";

// PUBLIC read-only catalog projection. This is intentionally separate from
// private imports, inventory, supplier price costs and the demo checkout.
export type ApprovedSoldOutProduct={
 id:string;name:string;description:string;priceCents:number;
 categoryId:string|null;categoryName:string|null;
 currency:"USD";availability:"sold_out"|"in_stock";canCheckout:false;
};
export type SoldOutCatalogResult={
 state:"disabled"|"unconfigured"|"unavailable"|"connected";
 products:ApprovedSoldOutProduct[];
 page:number;hasNext:boolean;
};

const APEX_ORIGIN="https://fhqpkpztercadcxspdkg.supabase.co";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedKeys=["id","name","description","price_cents","currency","availability","can_checkout"];
const categoryKeys=["category_id","category_name"];

export function parseApprovedSoldOutItems(raw:unknown):ApprovedSoldOutProduct[]|null{
 if(!Array.isArray(raw)||raw.length>24)return null;
 const ids=new Set<string>();
 const output:ApprovedSoldOutProduct[]=[];
 for(const item of raw){
  if(!item||typeof item!=="object"||Array.isArray(item))return null;
  const row=item as Record<string,unknown>;
  // Accept the prior seven-field projection during rollout, or the exact
  // nine-field projection with an independently published category.
  const hasCategory=Object.hasOwn(row,"category_id")||Object.hasOwn(row,"category_name");
  const expected=hasCategory?[...allowedKeys,...categoryKeys]:allowedKeys;
  if((Object.keys(row).length!==allowedKeys.length&&
      Object.keys(row).length!==expected.length)||
   Object.keys(row).some(key=>!expected.includes(key))||
   (hasCategory&&(
     typeof row.category_id!=="string"||!UUID.test(row.category_id)||
     typeof row.category_name!=="string"||
     row.category_name.trim().length<1||row.category_name.length>80||
     /[\\u0000-\\u001f\\u007f]/u.test(row.category_name)
   ))||
   typeof row.id!=="string"||!UUID.test(row.id)||ids.has(row.id)||
   typeof row.name!=="string"||row.name.trim().length===0||
   row.name.length>120||
   typeof row.description!=="string"||row.description.trim().length===0||
   row.description.length>1500||
   typeof row.price_cents!=="string"||!/^[1-9][0-9]{0,8}$/.test(row.price_cents)||
   row.currency!=="USD"||!["sold_out","in_stock"].includes(String(row.availability))||
   row.can_checkout!==false)return null;
  ids.add(row.id);
  output.push(Object.freeze({
   id:row.id,name:row.name,description:row.description,
   categoryId:hasCategory?row.category_id as string:null,
   categoryName:hasCategory?row.category_name as string:null,
   priceCents:Number(row.price_cents),
   currency:"USD",availability:row.availability as "sold_out"|"in_stock",canCheckout:false,
  }));
 }
 return output;
}

export async function readApprovedSoldOutCatalog(page=1):Promise<SoldOutCatalogResult>{
 if(!Number.isSafeInteger(page)||page<1||page>417)
  return {state:"unavailable",products:[],page:1,hasNext:false};
 const empty=(state:SoldOutCatalogResult["state"]):SoldOutCatalogResult=>({state,products:[],page,hasNext:false});
 // A separate future migration and approval are required to turn on this
 // feed. Under the current SQL release check, the feed must return [].
 if(process.env.APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled")
  return empty("disabled");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return empty("unconfigured");
 if(url!==APEX_ORIGIN||!key.startsWith("sb_publishable_"))
  return empty("unavailable");
 try{
  const endpoint=new URL("/rest/v1/rpc/get_public_inventory_catalog",url);
  endpoint.searchParams.set("p_offset",String((page-1)*24));
  endpoint.searchParams.set("p_limit","24");
  const response=await fetch(endpoint,{
   method:"GET",
   headers:{apikey:key,Accept:"application/json"},
   cache:"no-store",
   signal:AbortSignal.timeout(6000),
  });
  if(!response.ok)return empty("unavailable");
  const raw:unknown=await response.json();
  const products=parseApprovedSoldOutItems(raw);
  if(!products)return empty("unavailable");
  return {state:"connected",products,page,hasNext:products.length===24};
 }catch{
  return empty("unavailable");
 }
}
