// Private supplier readiness ONLY. A correctly stored image is not proof of
// authenticity, content approval or legal/public listing authorization.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i;
export function privateProductMediaPath(storeId,productId,path){
 if(typeof storeId!=="string"||!UUID.test(storeId)||
  typeof productId!=="string"||!UUID.test(productId)||
  typeof path!=="string"||path.length>180)return null;
 const prefix=`${storeId}/${productId}/`;
 if(!path.startsWith(prefix))return null;
 const file=path.slice(prefix.length);
 if(!FILE.test(file))return null;
 return Object.freeze({folder:`${storeId}/${productId}`,file,path});
}
export function assessPrivateMediaReadiness(input){
 const {pathValid=false,objectFound=false,signedPreview=false,
  reviewStatus="draft",snapshotImagePath=null,currentImagePath=null}=input??{};
 let status="missing";
 if(pathValid&&!objectFound)status="file_missing";
 else if(pathValid&&objectFound&&!signedPreview)status="preview_unavailable";
 else if(pathValid&&objectFound&&signedPreview)status="stored_privately";
 if(!pathValid&&currentImagePath)status="invalid_path";
 const approvedReview= status==="stored_privately"&&
  reviewStatus==="approved_internal"&&
  typeof snapshotImagePath==="string"&&snapshotImagePath===currentImagePath;
 return Object.freeze({
  status,
  privateImagePresent:status==="stored_privately",
  internalContentReviewCurrent:approvedReview,
  productSpecificIdentityVerified:false,
  publicMediaApproved:false,
  canDisplayPublicly:false,
  canCreateOrder:false,
 });
}
