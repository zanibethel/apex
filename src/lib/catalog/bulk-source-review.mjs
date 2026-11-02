import {proposedSoldOutPricing} from "./sold-out-import-pricing.mjs";
import {importDefaultDescription} from "./import-default-descriptions.mjs";

export const SOURCE_REVIEW_BATCH_LIMIT=20;
export const SOURCE_REVIEW_ACTIONS=Object.freeze(["under_review","hold","approved_for_draft"]);
export const SOURCE_REVIEW_STATES=Object.freeze(["unverified","under_review","hold","approved_for_draft"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sourceReviewSummary(row,linked=false){
 if(!row||typeof row!=="object"||typeof row.id!=="string"||
  !UUID.test(row.id)||!SOURCE_REVIEW_STATES.includes(row.review_status)||
  typeof row.product_name!=="string"||typeof row.strength!=="string"||
  !Number.isSafeInteger(row.source_index)||row.source_index<0)return null;
 const pricing=proposedSoldOutPricing(row.wholesale_cost_cents);
 const description=importDefaultDescription(row.product_name,row.strength);
 return Object.freeze({
  id:row.id,sourceIndex:row.source_index,name:row.product_name,
  strength:row.strength,status:row.review_status,linked,
  costCents:pricing?.sourceCostCents??null,
  retailCents:pricing?.salePriceCents??null,
  compareAtCents:pricing?.compareAtCents??null,
  description:description??null,
  needsIdentityCheck:!description||
   ["FOX-04","SLU-PP-322","GLOW","KLOW","T2","T3"].includes(row.product_name),
  validForDraft:!linked&&Boolean(pricing)&&Boolean(description),
  publicEligible:false,purchasable:false,
 });
}

export function validateSourceReviewBatch(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
  !SOURCE_REVIEW_ACTIONS.includes(raw.action)||
  !Array.isArray(raw.rows)||raw.rows.length<1||
  raw.rows.length>SOURCE_REVIEW_BATCH_LIMIT)return null;
 const seen=new Set();
 const rows=[];
 for(const row of raw.rows){
  if(!row||typeof row!=="object"||Array.isArray(row)||
   Object.keys(row).some(key=>!["id","status","costCents","checked"].includes(key))||
   !UUID.test(row.id)||seen.has(row.id)||
   !SOURCE_REVIEW_STATES.includes(row.status)||
   !Number.isSafeInteger(row.costCents)||row.costCents<=0||
   row.costCents>999999999||typeof row.checked!=="boolean")return null;
  if(raw.action==="approved_for_draft"&&!row.checked)return null;
  seen.add(row.id);
  rows.push(Object.freeze({
   id:row.id,status:row.status,costCents:row.costCents,checked:row.checked,
  }));
 }
 return Object.freeze({action:raw.action,rows:Object.freeze(rows)});
}
