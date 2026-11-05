// Authenticated supplier media triage only. A verified private image is never
// a public asset, a regulatory clearance, or a right to create a customer order.
export const PRIVATE_MEDIA_QUEUE_FILTERS=Object.freeze(["all","action","held","image","review","complete"]);
const ranks=Object.freeze({
 identity_hold:0,image_work:1,corrections:2,category_work:3,
 metadata_work:4,ready_to_request:5,stale_review:6,
 under_review:7,content_reviewed:8,unavailable:9,
});
const nextActions=Object.freeze({
 identity_hold:"Resolve exact product identity, strength or composition",
 image_work:"Correct or replace this private image",
 corrections:"Apply the requested internal review corrections",
 category_work:"Assign a reviewed category in the supplier editor",
 metadata_work:"Complete the private product setup checklist",
 ready_to_request:"Request an internal content review",
 stale_review:"Resubmit the changed image/details for review",
 under_review:"Await the current internal review decision",
 content_reviewed:"Keep image and review evidence current",
 unavailable:"Refresh and confirm review data",
});
const valid=product=>Boolean(product)&&typeof product.id==="string"&&
 typeof product.name==="string"&&typeof product.sku==="string";

/**
 * @param {{id:string,sku:string,name:string,category_id?:string|null}|null|undefined} product
 * @param {{privateImagePresent?:boolean,internalContentReviewCurrent?:boolean}|null|undefined} readiness
 * @param {string|null|undefined} reviewStatus
 * @param {{id:string,sku:string,name:string,category:string|null,status:string}|null|undefined} taxonomyProposal
 * @param {boolean} setupComplete
 */
export function classifyPrivateMediaQueue(product,readiness,reviewStatus,
 taxonomyProposal=null,setupComplete=false){
 let kind="unavailable";
 if(valid(product)&&readiness&&typeof readiness==="object"){
  const exactlyHeld=taxonomyProposal?.id===product.id&&
   taxonomyProposal.sku===product.sku&&taxonomyProposal.name===product.name&&
   taxonomyProposal.category===null&&
   typeof taxonomyProposal.status==="string"&&
   taxonomyProposal.status.startsWith("Review");
  if(exactlyHeld)kind="identity_hold";
  else if(readiness.privateImagePresent!==true)kind="image_work";
  else if(typeof product.category_id!=="string"||product.category_id==="")kind="category_work";
  else if(reviewStatus==="changes_requested")kind="corrections";
  else if(reviewStatus==="pending_review")kind="under_review";
  else if(reviewStatus==="approved_internal"&&readiness.internalContentReviewCurrent===true)
   kind="content_reviewed";
  else if(reviewStatus==="approved_internal")kind="stale_review";
  else if(reviewStatus==="draft"||reviewStatus===null||reviewStatus===undefined)
   kind=setupComplete===true?"ready_to_request":"metadata_work";
 }
 return Object.freeze({
  kind,priority:ranks[kind],nextAction:nextActions[kind],
  needsAction:!["under_review","content_reviewed","unavailable"].includes(kind),
  canRequestInternalReview:kind==="ready_to_request",
  publicMediaApproved:false,canDisplayPublicly:false,canCreateOrder:false,
 });
}

export function sortPrivateMediaQueue(records){
 if(!Array.isArray(records))return [];
 return [...records].sort((a,b)=>
  (a?.triage?.priority??99)-(b?.triage?.priority??99)||
  String(a?.product?.name??"").localeCompare(String(b?.product?.name??""),"en"));
}

export function privateMediaQueueFilter(records,filter="all"){
 if(!PRIVATE_MEDIA_QUEUE_FILTERS.includes(filter))return [];
 const sorted=sortPrivateMediaQueue(records);
 if(filter==="all")return sorted;
 if(filter==="action")return sorted.filter(row=>row.triage.needsAction);
 if(filter==="held")return sorted.filter(row=>row.triage.kind==="identity_hold");
 if(filter==="image")return sorted.filter(row=>row.triage.kind==="image_work");
 if(filter==="review")return sorted.filter(row=>[
  "corrections","ready_to_request","stale_review","under_review",
 ].includes(row.triage.kind));
 return sorted.filter(row=>row.triage.kind==="content_reviewed");
}

export function privateMediaQueueSummary(records){
 const results=sortPrivateMediaQueue(records);
 const count=kind=>results.filter(row=>row?.triage?.kind===kind).length;
 return Object.freeze({
  total:results.length,
  action:results.filter(row=>row?.triage?.needsAction===true).length,
  identityHolds:count("identity_hold"),
  imageWork:count("image_work"),
  readyToRequest:count("ready_to_request"),
  underReview:count("under_review"),
  reviewed:count("content_reviewed"),
  publicMediaApproved:0,
 });
}
