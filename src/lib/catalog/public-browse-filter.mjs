// Page-local public catalog search. Inputs come only from the approved,
// strictly release-gated public catalog projection; never private supplier data.
export const BROWSE_AVAILABILITY=Object.freeze(["all","in_stock","sold_out"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validCategory=p=>p&&typeof p.categoryId==="string"&&UUID.test(p.categoryId)&&
 typeof p.categoryName==="string"&&p.categoryName.trim().length>0&&
 p.categoryName.length<=80;

export function publicCatalogCategoryOptions(products){
 if(!Array.isArray(products))return [];
 const unique=new Map();
 for(const product of products){
  if(!validCategory(product))continue;
  if(!unique.has(product.categoryId))
   unique.set(product.categoryId,product.categoryName);
 }
 return [...unique].map(([id,name])=>({id,name}))
  .sort((a,b)=>a.name.localeCompare(b.name,"en"));
}

export function filterPublicCatalogPage(products,{
 query="",availability="all",categoryId="",
}={}){
 if(!Array.isArray(products)||typeof query!=="string"||query.length>64||
  !BROWSE_AVAILABILITY.includes(availability)||
  typeof categoryId!=="string"||
  (categoryId!==""&&!UUID.test(categoryId)))return [];
 const tokens=query.trim().toLocaleLowerCase("en-US").split(/\s+/u).filter(Boolean);
 return products.filter(product=>{
  if(!product||typeof product.name!=="string"||
   typeof product.description!=="string"||
   !["in_stock","sold_out"].includes(product.availability))return false;
  if(availability!=="all"&&product.availability!==availability)return false;
  if(categoryId!==""&&(!validCategory(product)||
   product.categoryId!==categoryId))return false;
  const text=(product.name+" "+product.description+" "+
   (validCategory(product)?product.categoryName:"")).toLocaleLowerCase("en-US");
  return tokens.every(token=>text.includes(token));
 });
}
