// Client-side view helper for saved and CSV-imported private product cards.
// Search and status filters never change persisted products, selection authority,
// supplier publication permissions, or the database's release controls.
export const BULK_VIEW_FILTERS=Object.freeze([
 "all","unsaved","ready","requested","needs_attention","save_retries",
]);

export function filterSupplierBulkRows(rows,query="",filter="all",listing=[],newRequests=new Set(),saveRetryKeys=new Set()){
 const term=String(query).trim().toLocaleLowerCase();
 const control=new Map(listing.map(status=>[status.productId,status]));
 const active=BULK_VIEW_FILTERS.includes(filter)?filter:"all";
 return rows.filter(row=>{
  if(term&&!String(row.name??"").toLocaleLowerCase().includes(term)&&
    !String(row.sku??"").toLocaleLowerCase().includes(term))return false;
  if(active==="save_retries")return saveRetryKeys.has(row.key);
  const status=row.id?control.get(row.id):undefined;
  const unsaved=!row.id||row.needsSave===true;
  const requested=Boolean(row.id&&(status?.requested===true||newRequests.has(row.id)));
  const ready=Boolean(row.id&&!unsaved&&!requested&&status?.canRequest===true);
  if(active==="unsaved")return unsaved;
  if(active==="ready")return ready;
  if(active==="requested")return requested;
  if(active==="needs_attention")return Boolean(row.id&&!unsaved&&!requested&&!ready);
  return true;
 });
}
