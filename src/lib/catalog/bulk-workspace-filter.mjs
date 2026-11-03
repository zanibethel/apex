// Read-only client filters for private product cards. No client filter can
// change supplier permissions, admin holds or actual customer visibility.
export const BULK_VIEW_FILTERS=Object.freeze([
 "all","unsaved","ready","requested","needs_attention","image_fixes",
 "admin_holds","review_pending","save_retries","taxonomy_held",
]);

const imageFix=status=>status?.hasImage===false||
 ["missing","correction","changed"].includes(status?.imageStatusKind);

const adminHold=status=>["hold","review"].includes(status?.kind)||
 status?.visibilityKind==="held";

const waitingReview=status=>status?.reviewStatus==="pending_review"||
 status?.correctionsPending===true;

export function supplierBulkNeedsAttention(row,status,requested=false){
 if(!row?.id||row.needsSave===true)return false;
 // In particular, a checked Publish preference must NEVER hide an admin hold.
 if(adminHold(status)||imageFix(status))return true;
 if(requested)return false;
 return status?.canRequest!==true;
}

export function supplierBulkWorkspaceSummary(rows=[],listing=[]){
 const controls=new Map((listing??[]).map(s=>[s.productId,s]));
 const summary={total:(rows??[]).length,privateSaved:0,imagesAttached:0,
  imageFixes:0,adminHolds:0,reviewPending:0,publishRequested:0,
  needsAttention:0,unsaved:0};
 for(const row of rows??[]){
  const status=row.id?controls.get(row.id):undefined;
  if(!row.id||row.needsSave===true)summary.unsaved++;
  if(!row.id)continue;
  summary.privateSaved++;
  if(status?.hasImage===true)summary.imagesAttached++;
  if(imageFix(status))summary.imageFixes++;
  if(adminHold(status))summary.adminHolds++;
  if(waitingReview(status))summary.reviewPending++;
  if(status?.requested===true)summary.publishRequested++;
  if(supplierBulkNeedsAttention(row,status,status?.requested===true))
   summary.needsAttention++;
 }
 return Object.freeze(summary);
}

export function filterSupplierBulkRows(rows,query="",filter="all",listing=[],newRequests=new Set(),saveRetryKeys=new Set(),heldTaxonomyIds=new Set()){
 const term=String(query).trim().toLocaleLowerCase();
 const controls=new Map((listing??[]).map(status=>[status.productId,status]));
 const active=BULK_VIEW_FILTERS.includes(filter)?filter:"all";
 return (rows??[]).filter(row=>{
  if(term&&!String(row.name??"").toLocaleLowerCase().includes(term)&&
    !String(row.sku??"").toLocaleLowerCase().includes(term))return false;
  if(active==="save_retries")return saveRetryKeys.has(row.key);
  // This is a private navigation filter only; holding an item never changes
  // its saved metadata, existing release gate, or admin review state.
  if(active==="taxonomy_held")return Boolean(row.id&&heldTaxonomyIds.has(row.id));
  const status=row.id?controls.get(row.id):undefined;
  const unsaved=!row.id||row.needsSave===true;
  const requested=Boolean(row.id&&(status?.requested===true||newRequests.has(row.id)));
  const ready=Boolean(row.id&&!unsaved&&!requested&&status?.canRequest===true&&!adminHold(status));
  if(active==="unsaved")return unsaved;
  if(active==="ready")return ready;
  if(active==="requested")return requested;
  if(active==="image_fixes")return Boolean(row.id&&imageFix(status));
  if(active==="admin_holds")return Boolean(row.id&&adminHold(status));
  if(active==="review_pending")return Boolean(row.id&&waitingReview(status));
  if(active==="needs_attention")return supplierBulkNeedsAttention(row,status,requested);
  return true;
 });
}
