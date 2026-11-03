// Private admin-facing display metadata only. The DB returns the actual
// release verdict, never this client-side helper.
const LABELS=Object.freeze({
 public_visible:"Visible · Sold Out",
 admin_hold:"Administrator hold",
 admin_review_required:"Administrator review required",
 same_supplier_identity_hold:"Related listing held",
 supplier_not_requested:"Publish off",
 content_review_pending:"Product changes need review",
 product_setup_incomplete:"Complete product information",
 category_not_published:"Category not published",
 inventory_not_sold_out:"Inventory is not Sold Out",
 insufficient_available_stock:"Sold Out · release checks still required",
 supplier_suspended:"Supplier restriction",
 supplier_authorization_unverified:"Supplier release eligibility missing",
 product_authorization_blocked:"Product release blocked",
 product_authorization_unverified:"Product release eligibility missing",
 public_release_disabled:"Public catalog gate off",
 release_conditions_unverified:"Additional release check required",
});
export function classifyAdminRelease(decision){
 if(!decision||typeof decision!=="object"||
    typeof decision.status_code!=="string"||
    typeof decision.effective_public!=="boolean")
   return Object.freeze({code:"unavailable",label:"Status unavailable",
    visible:false,needsReview:true});
 const {status_code:code,effective_public:effective}=decision;
 if(effective){
  if(code==="public_visible"&&decision.checks&&
    decision.checks.supplier_requested===true&&
    decision.checks.admin_clear===true&&
    decision.checks.supplier_authorized===true&&
    decision.checks.product_authorized===true&&
    decision.checks.public_release_enabled===true&&
    decision.checks.sold_out_inventory_valid===true&&
    decision.checks.category_published===true&&
    decision.checks.product_setup_complete===true&&
    decision.checks.content_review_clear===true&&
    decision.checks.same_supplier_identity_clear===true)
   return Object.freeze({code,label:LABELS.public_visible,
      visible:true,needsReview:false});
  return Object.freeze({code:"inconsistent",label:"Release response inconsistent",
   visible:false,needsReview:true});
 }
 if(code==="public_visible")
   return Object.freeze({code:"inconsistent",label:"Release response inconsistent",
    visible:false,needsReview:true});
 return Object.freeze({
  code,label:LABELS[code]??"Unknown release restriction",
  visible:false,needsReview:code!=="supplier_not_requested",
 });
}
export function summarizeAdminRelease(items){
 const rows=Array.isArray(items)?items:[];
 const output={total:rows.length,visible:0,private:0,review:0,
  unavailable:0,publishOn:0};
 for(const item of rows){
  const result=classifyAdminRelease(item?.decision);
  if(item?.publishEnabled===true)output.publishOn++;
  if(result.visible)output.visible++;
  else if(result.code==="supplier_not_requested")output.private++;
  else if(result.code==="unavailable"||result.code==="inconsistent")
   output.unavailable++;
  else output.review++;
 }
 return Object.freeze(output);
}
