// Labels for the authenticated, private, DB-evaluated release status.
// Never derive "published" from supplier intent, content approval or metadata.
const messages={
 admin_hold:["Administrative hold","An administrator must lift this hold."],
 admin_review_required:["Admin review required","The listing remains blocked until an administrator releases it."],
 same_supplier_identity_hold:["Matching listing held","A listing with the same normalized product name is held for this supplier."],
 supplier_not_requested:["Publish off","The supplier has turned off publishing for this product."],
 content_review_pending:["Content changes need review","A submitted content review is pending or changes were requested."],
 product_setup_incomplete:["Product details incomplete","Finish required private product fields before release."],
 insufficient_available_stock:["Sold Out","Stock is zero; a Sold Out listing is possible after the separate release checks."],
 category_not_published:["Category not published","The product category needs an authorized public release."],
 inventory_not_sold_out:["Inventory status prevents Sold Out","Stock must be exactly zero to display this item as Sold Out."],
 release_conditions_unverified:["Additional release check needed","One or more protected public-listing conditions are not satisfied."],
 public_visible:["Live · Sold Out","The protected public catalog confirms a Sold Out listing. Checkout is unavailable."],
 supplier_suspended:["Supplier authorization suspended","Platform administration must resolve the supplier restriction."],
 supplier_authorization_unverified:["Supplier authorization not verified","Supplier eligibility evidence must be reviewed independently."],
 product_authorization_blocked:["Product authorization blocked","This product is prohibited from release pending an administrative decision."],
 product_authorization_unverified:["Product eligibility not verified","Product-specific eligibility and authorization must be established."],
 public_release_disabled:["Public release disabled","All current private checks pass, but public release remains switched off."],
};
export function privateReleaseDisplay(data){
 if(!data||typeof data!=="object"||
    typeof data.effective_public!=="boolean"||
    typeof data.status_code!=="string")
  return {label:"Decision unavailable",description:"The release decision could not be verified. The listing remains private."};
 if(data.effective_public===true){
  return data.status_code==="public_visible"?
   {label:"Live · Sold Out",description:"The public catalog confirms this eligible product is visible. Checkout remains unavailable."}:
   {label:"Decision mismatch",description:"Public visibility cannot be verified. Contact the administrator."};
 }
 if(data.status_code==="public_visible")
  return {label:"Decision mismatch",description:"Public visibility cannot be verified. Contact the administrator."};
 const details=messages[data.status_code];
 if(!details)return {label:"Unknown restriction",description:"A valid release decision is required before any public listing."};
 return {label:details[0],description:details[1]};
}
