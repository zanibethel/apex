// UI-only selection helper: never grants publication privileges.
// The database RPC independently validates each requested product again.
export function eligiblePrivatePublishIds(rows,listing,requestedIds=new Set()){
 const state=new Map(listing.map(item=>[item.productId,item]));
 return rows.filter(row=>{
  const status=state.get(row.id);
  return Boolean(row.id)&&!row.needsSave&&
   status?.canRequest===true&&status.requested!==true&&
   !requestedIds.has(row.id);
 }).map(row=>row.id);
}
