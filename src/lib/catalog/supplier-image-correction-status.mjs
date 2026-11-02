// Supplier-visible image feedback is a deliberately restricted projection.
// No admin-only evidence references, private photo URLs, or public release rights.
export function supplierImageCorrectionStatus(product,review,feedback,available=true){
 if(!available)return {
  kind:"unavailable",label:"Image status unavailable",
  message:"Media feedback could not be loaded. Refresh before relying on review status.",
  needsAction:true,
 };
 if(!product?.id||!product?.image_path)return {
  kind:"missing",label:"Image needed",
  message:"Upload or select an accurate image for this product using the pencil editor.",
  needsAction:true,
 };
 if(!review||review.product_id!==product.id||review.store_id!==product.store_id)
  return {kind:"unreviewed",label:"Image review needed",
   message:"The private image is saved. Submit the product details for internal review when ready.",
   needsAction:true};
 if(review.snapshot?.image_path!==product.image_path)
  return {kind:"changed",label:"Image changed · review again",
   message:"This image differs from the last submitted version. Save and resubmit the current product details.",
   needsAction:true};
 if(!feedback)return {kind:"pending",label:"Image evidence pending",
  message:"An administrator has not recorded image identity and usage-rights feedback for this submission.",
  needsAction:false};
 if(feedback.product_id!==product.id||feedback.store_id!==product.store_id||
   feedback.submission_id!==review.submission_id||
   feedback.image_path!==product.image_path)return {
    kind:"changed",label:"Image evidence outdated",
    message:"The previous feedback refers to a different image or submission. The current version needs review.",
    needsAction:true,
   };
 if(feedback.outcome==="needs_correction"){
  const message=typeof feedback.supplier_note==="string"?feedback.supplier_note.trim():"";
  return {kind:"correction",label:"Image corrections needed",
   message:message||"An administrator requested corrections to this image and supporting documentation.",
   needsAction:true};
 }
 if(feedback.outcome==="evidence_recorded"&&review.status==="approved_internal")
  return {kind:"recorded",label:"Image evidence recorded",
   message:"Identity and image-use-rights references were recorded privately. Public visibility still requires separate approval.",
   needsAction:false};
 return {kind:"pending",label:"Image review not current",
  message:"The private review status changed. Please check or resubmit the current product.",
  needsAction:true};
}
