// Track 1 public-media contract v1. Inputs are trusted server-side records,
// NEVER browser claims. This module has no storage I/O or checkout side effects.
// Private image paths, evidence documents, source costs and signed URLs never
// enter a public result.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const IMAGE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;
const allowedKeys=Object.freeze([
 "schemaVersion","versionId","storeId","productId","submissionId",
 "evidenceEventId","sourceImagePath","sha256","assetKey",
]);

export function parsePublicMediaVersionV1(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
  Object.keys(raw).length!==allowedKeys.length||
  Object.keys(raw).some(key=>!allowedKeys.includes(key)))return null;
 const v=raw;
 for(const key of ["versionId","storeId","productId","submissionId","evidenceEventId"]){
  if(typeof v[key]!=="string"||!UUID.test(v[key]))return null;
 }
 if(v.schemaVersion!==1||typeof v.sha256!=="string"||!HEX.test(v.sha256)||
  typeof v.sourceImagePath!=="string"||v.sourceImagePath.length>180)return null;
 const prefix=v.storeId+"/"+v.productId+"/";
 if(!v.sourceImagePath.startsWith(prefix)||
  !IMAGE.test(v.sourceImagePath.slice(prefix.length)))return null;
 const ext=v.sourceImagePath.split(".").at(-1).toLowerCase();
 const assetKey="media/v1/"+v.storeId+"/"+v.productId+"/"+
  v.versionId+"/"+v.sha256+"."+ext;
 if(v.assetKey!==assetKey)return null;
 return Object.freeze(Object.fromEntries(allowedKeys.map(k=>[k,v[k]])));
}

const unavailable=Object.freeze({
 state:"unavailable",asset:null,canDisplayPublicly:false,
 canCreateOrder:false,canPay:false,
});

// This validator is deliberately stricter than a catalog record. Every
// release predicate must be independently confirmed on EACH asset lookup.
// In particular, the latest media evidence must be the very same event, and
// the product's current image and internal review snapshot must still match.
export function resolvePublicMediaDeliveryV1({
 version,product,review,evidence,latestEvidenceId,store,category,
 listing,supplierAuthorization,productAuthorization,globalReleaseEnabled,
 mediaDeliveryEnabled,revokedVersionIds=[],identityHoldActive,
}= {}){
 const v=parsePublicMediaVersionV1(version);
 if(!v||globalReleaseEnabled!==true||mediaDeliveryEnabled!==true||
  identityHoldActive!==false||!Array.isArray(revokedVersionIds)||
  revokedVersionIds.includes(v.versionId))return unavailable;
 if(!product||product.id!==v.productId||product.store_id!==v.storeId||
  product.image_path!==v.sourceImagePath||product.is_active!==true||
  product.is_published!==false||product.category_id!==category?.id||
  product.currency!=="USD")return unavailable;
 if(!store||store.id!==v.storeId||store.is_public!==false||
  typeof store.supplier_id!=="string")return unavailable;
 if(!category||category.store_id!==v.storeId||category.is_published!==true)
  return unavailable;
 if(!listing||listing.store_id!==v.storeId||
  listing.product_id!==v.productId||
  listing.supplier_wants_listing!==true||
  listing.admin_gate!=="clear"||
  (listing.republish_approval_required===true&&
   listing.republish_approved!==true))return unavailable;
 if(!review||review.store_id!==v.storeId||
  review.product_id!==v.productId||
  review.submission_id!==v.submissionId||
  review.status!=="approved_internal"||
  !review.snapshot||typeof review.snapshot!=="object"||
  review.snapshot.image_path!==v.sourceImagePath)return unavailable;
 if(!evidence||latestEvidenceId!==v.evidenceEventId||
  evidence.id!==v.evidenceEventId||
  evidence.store_id!==v.storeId||evidence.product_id!==v.productId||
  evidence.submission_id!==v.submissionId||
  evidence.image_path!==v.sourceImagePath||
  evidence.review_status!=="evidence_recorded"||
  typeof evidence.identity_reference!=="string"||
  evidence.identity_reference.trim().length<8||
  typeof evidence.rights_reference!=="string"||
  evidence.rights_reference.trim().length<8)return unavailable;
 // Both independently verified authorizations must be current, specific,
 // and supported by review evidence. These booleans represent trusted
 // independently checked database predicates, NEVER client fields.
 if(!supplierAuthorization||supplierAuthorization.supplier_id!==store.supplier_id||
  supplierAuthorization.current!==true||
  productAuthorization?.store_id!==v.storeId||
  productAuthorization?.product_id!==v.productId||
  productAuthorization.current!==true)return unavailable;
 return Object.freeze({
  state:"ready",
  asset:Object.freeze({
   schemaVersion:1,versionId:v.versionId,productId:v.productId,
   assetKey:v.assetKey,sha256:v.sha256,
  }),
  canDisplayPublicly:true,canCreateOrder:false,canPay:false,
 });
}
