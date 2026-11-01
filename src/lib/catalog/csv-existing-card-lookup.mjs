// Build a read-only lookup of cards already in the private bulk editor.
// An unsaved product still owns its staged SKU within the current workspace:
// importing the same CSV again should update that card, not create another.
// Ambiguous duplicate SKUs must never silently pick one row to overwrite.
export function csvExistingCardLookup(rows){
 const byId=new Map();
 const bySku=new Map();
 const ambiguousSkus=new Set();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||typeof row!=="object")continue;
  if(typeof row.id==="string"&&row.id)byId.set(row.id.toLowerCase(),row);
  const sku=String(row.sku??"").trim().toUpperCase();
  if(!sku||ambiguousSkus.has(sku))continue;
  const previous=bySku.get(sku);
  if(previous&&previous.key!==row.key){
   ambiguousSkus.add(sku);
   bySku.delete(sku);
  }else bySku.set(sku,row);
 }
 return {byId,bySku,ambiguousSkus};
}
