// Private audit events are supplied newest-first from the store-scoped RLS
// query. A newer admin action closes a previous supplier resubmission.
// This is DISPLAY STATE ONLY; neither helper authorizes public listing.
const ADMIN_DECISIONS=new Set([
 "admin_hold","admin_review_required","admin_republish_approved","admin_unpublish",
]);

export function latestPendingSupplierCorrection(events){
 if(!Array.isArray(events))return null;
 for(const event of events){
  if(event?.action==="supplier_corrections_resubmitted"){
   return {
    note:typeof event.reason==="string"?event.reason.slice(0,500):"",
    createdAt:typeof event.created_at==="string"?event.created_at:null,
   };
  }
  if(ADMIN_DECISIONS.has(event?.action))return null;
 }
 return null;
}

export function awaitingAdministratorCorrectionReview(events){
 return latestPendingSupplierCorrection(events)!==null;
}
