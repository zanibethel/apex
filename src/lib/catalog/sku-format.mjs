// Pure SKU formatter shared between supplier CSV preview and server creation.
// Database uniqueness, authorization and normalization remain server-enforced.
export function draftSkuFromUuid(name,id){
 const base=String(name??"")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"").slice(0,28)
  .replace(/-+$/g,"")||"PRODUCT";
 if(typeof id!=="string"||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  throw new Error("Draft SKU ID must be a UUID");
 return "APX-"+base+"-"+id.slice(0,8).toUpperCase();
}
