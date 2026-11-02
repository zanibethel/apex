import {privateProductMediaPath} from "./private-media-readiness.mjs";

// This is an observational ADMIN checklist, not an image attestation.
// Internal product content review cannot authorize public image delivery,
// establish rights to an illustration, or prove the pictured item identity.
export const MEDIA_RELEASE_CHECKS=Object.freeze([
 Object.freeze({key:"review_submitted",label:"Private content submitted for internal review"}),
 Object.freeze({key:"private_image_attached",label:"Snapshot has product-scoped private image"}),
 Object.freeze({key:"private_preview_accessible",label:"Private image can be previewed by administrator"}),
 Object.freeze({key:"content_review_approved",label:"Submitted content approved internally"}),
 Object.freeze({key:"current_version_confirmed",label:"Current product/image revision independently confirmed"}),
 Object.freeze({key:"identity_verified",label:"Product-specific image and ingredient identity verified"}),
 Object.freeze({key:"image_rights_verified",label:"Permission to publish this image verified"}),
 Object.freeze({key:"product_release_authorized",label:"Independent product and supplier release authorization"}),
 Object.freeze({key:"public_asset_published",label:"Approved immutable public asset created"}),
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStatus=new Set(["pending_review","approved_internal","changes_requested"]);
export function assessAdminMediaRelease(record,privatePreviewAccessible=false){
 const unavailable=()=>Object.freeze({
  state:"unavailable",canDisplayPublicly:false,canCreateOrder:false,
  checks:Object.freeze(MEDIA_RELEASE_CHECKS.map(item=>Object.freeze({
   key:item.key,label:item.label,passed:false,
  }))),
 });
 if(!record||typeof record!=="object"||Array.isArray(record)||
   typeof record.store_id!=="string"||!UUID.test(record.store_id)||
   typeof record.product_id!=="string"||!UUID.test(record.product_id)||
   !allowedStatus.has(record.status)||
   !record.snapshot||typeof record.snapshot!=="object"||
   Array.isArray(record.snapshot))return unavailable();
 const snapshot=record.snapshot;
 const image=privateProductMediaPath(record.store_id,record.product_id,snapshot.image_path);
 const passed={
  review_submitted:true,
  private_image_attached:Boolean(image),
  private_preview_accessible:Boolean(image&&privatePreviewAccessible),
  content_review_approved:record.status==="approved_internal",
  // These MUST NOT be inferred from a private review record or a
  // supplier-provided caption; independent records do not yet exist.
  current_version_confirmed:false,
  identity_verified:false,
  image_rights_verified:false,
  product_release_authorized:false,
  public_asset_published:false,
 };
 return Object.freeze({
  state:"private_review_only",
  canDisplayPublicly:false,canCreateOrder:false,
  checks:Object.freeze(MEDIA_RELEASE_CHECKS.map(item=>Object.freeze({
   key:item.key,label:item.label,passed:passed[item.key],
  }))),
 });
}
