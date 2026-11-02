import {privateProductMediaPath} from "./private-media-readiness.mjs";

// Evidence is about one exact private image in one exact internal submission.
// Even a CURRENT record is NOT a public media approval or legal-sale permission.
export function privateMediaEvidenceStatus(review,event){
 const snap=review?.snapshot;
 const path=snap&&typeof snap==="object"&&!Array.isArray(snap)?snap.image_path:null;
 const valid=privateProductMediaPath(review?.store_id,review?.product_id,path);
 if(!valid)return {kind:"missing",label:"No product-specific image",current:false};
 if(!event)return {kind:"unreviewed",label:"No media evidence recorded",current:false};
 const current=review?.status==="approved_internal"&&
   event.store_id===review.store_id&&event.product_id===review.product_id&&
   event.submission_id===review.submission_id&&
   event.image_path===valid.path;
 if(!current)return {kind:"stale",label:"Evidence requires new review",current:false};
 if(event.review_status==="needs_correction")
  return {kind:"changes",label:"Media changes requested",current:true};
 if(event.review_status==="evidence_recorded"&&
  typeof event.identity_reference==="string"&&event.identity_reference.trim().length>=8&&
  typeof event.rights_reference==="string"&&event.rights_reference.trim().length>=8)
  return {kind:"recorded",label:"Image identity and rights evidence recorded",current:true};
 return {kind:"unavailable",label:"Evidence invalid or unavailable",current:false};
}
