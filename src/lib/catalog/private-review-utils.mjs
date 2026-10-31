const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidId(value) {
 return typeof value==="string"&&uuid.test(value);
}
export function internalReviewLabel(status) {
 switch(status){
  case "pending_review":return "Pending review";
  case "changes_requested":return "Changes requested";
  case "approved_internal":return "Approved internally";
  default:return "Not submitted";
 }
}
