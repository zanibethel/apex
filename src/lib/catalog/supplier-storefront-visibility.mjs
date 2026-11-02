// Supplier-facing status derived ONLY from authenticated database facts.
// Never infer public visibility from a checked Publish switch or a local save.
// Public "Live" is intentionally unreachable until the release-readiness RPC
// explicitly supports it and independently confirms every required check.
const VALID_CODES=new Set([
 "admin_hold","admin_review_required","same_supplier_identity_hold",
 "supplier_not_requested","content_review_pending","product_setup_incomplete",
 "insufficient_available_stock","supplier_suspended",
 "supplier_authorization_unverified","product_authorization_blocked",
 "product_authorization_unverified","public_release_disabled","public_visible",
]);
const EXPLANATIONS=Object.freeze({
 admin_hold:"The platform administrator placed this listing on hold.",
 admin_review_required:"An administrator must release the required review.",
 same_supplier_identity_hold:"A product with the same identity has an active hold.",
 content_review_pending:"Product content changes require review.",
 product_setup_incomplete:"Required product details or imagery are incomplete.",
 insufficient_available_stock:"No units are available. Sold Out display remains a separate eligibility-checked release; checkout stays disabled.",
 supplier_suspended:"Supplier authorization is suspended.",
 supplier_authorization_unverified:"Supplier eligibility has not been independently verified.",
 product_authorization_blocked:"Product release is explicitly blocked.",
 product_authorization_unverified:"Product-specific release eligibility is not verified.",
 public_release_disabled:"Independent public release is currently switched off.",
 supplier_not_requested:"The publication request has not yet appeared in the release check. Refresh status.",
});
const notLive=(kind,label,description)=>Object.freeze({kind,label,description,publiclyVisible:false});

export function supplierStorefrontVisibility(control,releaseDecision,requestJustSaved=false){
 // Admin blocks always take priority, including over a pending client action.
 if(control?.adminGate==="hold")return notLive("held","Held · not live",
  "An administrator must lift the hold. The Publish switch cannot override it.");
 if(control?.adminGate==="review_required"||
    (control?.republishApprovalRequired===true&&control?.republishApproved!==true))
  return notLive("held","Review required · not live",
   "The administrator must complete the required review before publishing.");
 if(control?.available===false)return notLive("unavailable","Status unavailable",
  "Unable to verify the listing controls. Refresh before making changes.");
 const wants=control?.requested===true||requestJustSaved===true;
 if(!wants)return notLive("private","Not live",
  "The supplier has not requested publication. An eligible product still needs independent release authorization.");

 if(!releaseDecision||typeof releaseDecision!=="object"||
    !VALID_CODES.has(releaseDecision.status_code)||
    typeof releaseDecision.effective_public!=="boolean")
  return notLive("unavailable","Visibility unavailable",
   "Publication was requested, but the protected release check could not be verified. Refresh this card.");

 // Both a positive effective-public verdict and a positive named release state
 // are necessary. No client-side inputs or provisional pricing can make "Live".
 const checks=releaseDecision.checks;
 const live=control?.requested===true&&releaseDecision.status_code==="public_visible"&&
  releaseDecision.effective_public===true&&checks&&typeof checks==="object"&&
  checks.supplier_requested===true&&checks.admin_clear===true&&
  checks.supplier_authorized===true&&checks.product_authorized===true&&
  checks.public_release_enabled===true&&checks.same_supplier_identity_clear===true&&
  checks.content_review_clear===true&&checks.product_setup_complete===true;
 if(live)return Object.freeze({
  kind:"live",label:"Live · sold out",
  description:"The protected server release decision confirms this listing is public. Checkout remains disabled.",
  publiclyVisible:true,
 });

 // A contradictory verdict is never accepted as public or silently hidden
 // behind a generic success message.
 if(releaseDecision.effective_public===true)
  return notLive("unavailable","Visibility check failed",
   "The release response was inconsistent. Visibility cannot be confirmed; contact the administrator.");

 const detail=EXPLANATIONS[releaseDecision.status_code]??
  "An independent eligibility check has not authorized this product.";
 return notLive("requested","Requested · not live",detail);
}
