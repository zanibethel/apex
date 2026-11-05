import {privateMediaEvidenceStatus} from "./private-media-evidence.mjs";

// Admin-side private submitted-review queue only. Never turns media evidence,
// internal content approval, or a short-lived signed image into public rights.
export const ADMIN_MEDIA_QUEUE_FILTERS=Object.freeze([
 "action","all","pending","corrections","evidence","recorded",
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds=Object.freeze({
 image_problem:{rank:0,label:"Submitted image unavailable",next:"Request a correct product-specific image"},
 review_pending:{rank:1,label:"Internal review pending",next:"Decide the current private content submission"},
 evidence_correction:{rank:2,label:"Image evidence correction needed",next:"Review and resolve the latest image correction"},
 needs_evidence:{rank:3,label:"Evidence not yet recorded",next:"Verify current image identity and permission to use it"},
 stale_evidence:{rank:4,label:"Previous evidence is stale",next:"Recheck the current submission and its image evidence"},
 changes_requested:{rank:5,label:"Supplier changes requested",next:"Wait for supplier corrections and resubmission"},
 evidence_recorded:{rank:6,label:"Image evidence recorded",next:"Preserve evidence; public media review is still separate"},
 unavailable:{rank:7,label:"Review information unavailable",next:"Refresh and check the private review record"},
});
const valid=r=>r&&typeof r==="object"&&!Array.isArray(r)&&
 typeof r.store_id==="string"&&UUID.test(r.store_id)&&
 typeof r.product_id==="string"&&UUID.test(r.product_id)&&
 typeof r.submission_id==="string"&&UUID.test(r.submission_id)&&
 ["pending_review","approved_internal","changes_requested"].includes(r.status);

/**
 * @param {{store_id:string,product_id:string,submission_id:string,status:string,snapshot:unknown,submitted_at?:string}|null|undefined} review
 * @param {{store_id:string,product_id:string,submission_id:string,image_path:string,review_status:string,identity_reference?:string|null,rights_reference?:string|null}|null|undefined} event
 */
export function classifyAdminMediaEvidence(review,event=null){
 const status=valid(review)?privateMediaEvidenceStatus(review,event):null;
 let kind="unavailable";
 if(status){
  if(status.kind==="missing")kind="image_problem";
  else if(review.status==="pending_review")kind="review_pending";
  else if(review.status==="changes_requested")kind="changes_requested";
  else if(status.kind==="recorded")kind="evidence_recorded";
  else if(status.kind==="changes")kind="evidence_correction";
  else if(status.kind==="stale")kind="stale_evidence";
  else if(status.kind==="unreviewed")kind="needs_evidence";
 }
 const descriptor=kinds[kind];
 return Object.freeze({
  kind,rank:descriptor.rank,label:descriptor.label,next:descriptor.next,
  adminAction:["review_pending","needs_evidence","evidence_correction",
   "stale_evidence","image_problem"].includes(kind),
  publicMediaApproved:false,canDisplayPublicly:false,canCreateOrder:false,
 });
}

export function filterAdminMediaEvidenceQueue(rows,filter="action"){
 if(!Array.isArray(rows)||!ADMIN_MEDIA_QUEUE_FILTERS.includes(filter))return [];
 const sorted=[...rows].sort((a,b)=>
  (a?.triage?.rank??99)-(b?.triage?.rank??99)||
  String(a?.review?.submitted_at??"").localeCompare(String(b?.review?.submitted_at??""))||
  String(a?.review?.product_id??"").localeCompare(String(b?.review?.product_id??"")));
 const choose=item=>{
  const kind=item?.triage?.kind;
  if(!Object.hasOwn(kinds,kind))return false;
  if(filter==="all")return true;
  if(filter==="action")return item.triage.adminAction===true;
  if(filter==="pending")return kind==="review_pending";
  if(filter==="corrections")return ["image_problem","evidence_correction",
   "stale_evidence","changes_requested"].includes(kind);
  if(filter==="evidence")return kind==="needs_evidence";
  return kind==="evidence_recorded";
 };
 return sorted.filter(choose);
}
export function summarizeAdminMediaEvidenceQueue(rows){
 if(!Array.isArray(rows))return Object.freeze({
  total:0,action:0,pending:0,corrections:0,evidence:0,recorded:0,
  publicMediaApproved:0,
 });
 const count=filter=>filterAdminMediaEvidenceQueue(rows,filter).length;
 return Object.freeze({
  total:count("all"),action:count("action"),pending:count("pending"),
  corrections:count("corrections"),evidence:count("evidence"),
  recorded:count("recorded"),publicMediaApproved:0,
 });
}
