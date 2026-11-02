import {proposedSoldOutPricing} from "./sold-out-import-pricing.mjs";
import {importDefaultDescription} from "./import-default-descriptions.mjs";

export const REVIEWED_DRAFT_BATCH_LIMIT=10;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reviewedImportDraftPlan(candidate,linked=false){
 if(!candidate||typeof candidate!=="object"||!UUID.test(candidate.id)|| 
  typeof candidate.product_name!=="string"||typeof candidate.strength!=="string"||
  typeof candidate.review_status!=="string")return null;
 const name=[candidate.product_name.trim(),candidate.strength.trim()].join(" — ");
 const pricing=proposedSoldOutPricing(candidate.wholesale_cost_cents);
 const description=importDefaultDescription(candidate.product_name,candidate.strength);
 const status=linked?"already_saved":
  candidate.review_status!=="approved_for_draft"?"requires_review":
  !pricing||!description||name.length>120?"invalid_source":"ready";
 return Object.freeze({
  candidateId:candidate.id,name,status,
  sourceIndex:candidate.source_index,
  sourceCostCents:pricing?.sourceCostCents??null,
  salePriceCents:pricing?.salePriceCents??null,
  proposedCompareAtCents:pricing?.compareAtCents??null,
  description,
  startingStock:0,mayPublish:false,mayCreateOrder:false,
 });
}
export function validateReviewedDraftSelection(value){
 if(!Array.isArray(value)||value.length<1||value.length>REVIEWED_DRAFT_BATCH_LIMIT||
  value.some(id=>typeof id!=="string"||!UUID.test(id))||
  new Set(value).size!==value.length)return null;
 return value;
}
