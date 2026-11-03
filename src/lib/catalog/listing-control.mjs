// Private publishing-intent state; never a public storefront eligibility signal.
export function listingControlStatus(control) {
 if(!control)return {label:"Publish off",kind:"private",canRequest:true};
 if(control.admin_gate==="hold")
  return {label:"Administrative hold",kind:"hold",canRequest:false};
 if(control.admin_gate==="review_required" ||
    (control.republish_approval_required&&!control.republish_approved))
  return {label:"Admin review required",kind:"review",canRequest:false};
 return control.supplier_wants_listing
   ?{label:"Publish on · check storefront status",kind:"requested",canRequest:true}
   :{label:"Publish off",kind:"private",canRequest:true};
}
export function listingControlAuditAction(value) {
 return {
  publish_requested:"Supplier requested publication",
  unpublish_requested:"Supplier requested unpublication",
  admin_hold:"Administrator placed a hold",
  admin_unpublish:"Administrator unpublished the listing",
  admin_review_required:"Administrator required review",
  admin_republish_approved:"Administrator approved republishing",
  supplier_corrections_resubmitted:"Supplier resubmitted corrections for review",
 }[value]??"Listing action";
}
