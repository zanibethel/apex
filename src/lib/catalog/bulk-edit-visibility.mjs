// Preserve editability when a status/search filter would otherwise remove a
// card from the screen as soon as the first field becomes dirty.
// This is UI-only: publication readiness is still checked by the server/RPC.
export function bulkViewAfterEdit(query,field){
 return {
  query:(field==="name"||field==="sku")?"":query,
  filter:"all",
 };
}
export function selectEditedBulkRow(previous,key){
 return previous.includes(key)?previous:[...previous,key];
}
