// Events are sorted most recent first by the server. Ignore supplier
// unpublish events: only a newer administrator decision resolves a resubmission.
// A missing or truncated history never grants visibility or public eligibility.
const ADMIN_DECISIONS=new Set([
 "admin_hold","admin_review_required","admin_republish_approved","admin_unpublish",
]);
export function awaitingAdministratorCorrectionReview(events){
 if(!Array.isArray(events))return false;
 for(const event of events){
  if(event?.action==="supplier_corrections_resubmitted")return true;
  if(ADMIN_DECISIONS.has(event?.action))return false;
 }
 return false;
}
