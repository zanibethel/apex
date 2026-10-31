// Labels for the authenticated, private, DB-evaluated release status.
// Never derive "published" from supplier intent, content approval or metadata.
const messages={
 admin_hold:["Administrative hold","An administrator must lift this hold."],
 admin_review_required:["Admin review required","The listing remains blocked until an administrator releases it."],
 same_supplier_identity_hold:["Matching listing held","A listing with the same normalized product name is held for this supplier."],
 supplier_not_requested:["No supplier publication request","The supplier has not requested release of this product."],
 content_review_pending:["Content changes need review","A submitted content review is pending or changes were requested."],
 product_setup_incomplete:["Product details incomplete","Finish required private product fields before release."],
 insufficient_available_stock:["No available stock","Update inventory; reserved units are unavailable."],
 supplier_suspended:["Supplier authorization suspended","Platform administration must resolve the supplier restriction."],
 supplier_authorization_unverified:["Supplier authorization not verified","Supplier eligibility evidence must be reviewed independently."],
 product_authorization_blocked:["Product authorization blocked","This product is prohibited from release pending an administrative decision."],
 product_authorization_unverified:["Product eligibility not verified","Product-specific eligibility and authorization must be established."],
 public_release_disabled:["Public release disabled","All current private checks pass, but public release remains switched off."],
};
export function privateReleaseDisplay(data){
 if(!data||typeof data!=="object"||data.effective_public!==false||
    typeof data.status_code!=="string")
  return {label:"Decision unavailable",description:"The release decision could not be verified. The listing remains private."};
 const details=messages[data.status_code];
 if(!details)return {label:"Unknown restriction",description:"A valid release decision is required before any public listing."};
 return {label:details[0],description:details[1]};
}
