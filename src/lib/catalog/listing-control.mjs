// Private publishing-intent state; never a public storefront eligibility signal.
export function listingControlStatus(control) {
 if(!control)return {label:"Not requested",kind:"private",canRequest:true};
 if(control.admin_gate==="hold")
  return {label:"Administrative hold",kind:"hold",canRequest:false};
 if(control.admin_gate==="review_required" ||
    (control.republish_approval_required&&!control.republish_approved))
  return {label:"Admin review required",kind:"review",canRequest:false};
 return control.supplier_wants_listing
   ?{label:"Supplier wants to publish · not live",kind:"requested",canRequest:true}
   :{label:"Private · supplier may request publication",kind:"private",canRequest:true};
}
export function listingControlAuditAction(value) {
 return {
  publish_requested:"Supplier requested publication",
  unpublish_requested:"Supplier requested unpublication",
  admin_hold:"Administrator placed a hold",
  admin_review_required:"Administrator required review",
  admin_republish_approved:"Administrator approved republishing",
 }[value]??"Listing action";
}
