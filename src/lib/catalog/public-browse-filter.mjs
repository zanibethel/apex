// Page-local public catalog search. Inputs come only from the approved,
// strictly release-gated public catalog projection; never private supplier data.
export const BROWSE_AVAILABILITY=Object.freeze(["all","in_stock","sold_out"]);
export function filterPublicCatalogPage(products,{query="",availability="all"}={}){
 if(!Array.isArray(products)||typeof query!=="string"||query.length>64||
  !BROWSE_AVAILABILITY.includes(availability))return [];
 const tokens=query.trim().toLocaleLowerCase("en-US").split(/\s+/u).filter(Boolean);
 return products.filter(product=>{
  if(!product||typeof product.name!=="string"||
   typeof product.description!=="string"||
   !["in_stock","sold_out"].includes(product.availability))return false;
  if(availability!=="all"&&product.availability!==availability)return false;
  const text=(product.name+" "+product.description).toLocaleLowerCase("en-US");
  return tokens.every(token=>text.includes(token));
 });
}
