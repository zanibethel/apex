import {validateProductOptions} from "./product-option-picker-v1.mjs";
import {reviewFormula} from "./supplier-parent-review-snapshot.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL=/^[A-Za-z0-9][A-Za-z0-9 .,_()+-]{0,39}$/;
export const INTAKE_MAX_ROWS=250;

// A private navigation projection of already-staged supplier proposals.
// Deliberately independent from the public catalog and saved product CRUD.
// Never infer a new SKU or mark these source rows as published/stocked.
export function supplierIntakeCards(rows){
 if(!Array.isArray(rows)||rows.length>INTAKE_MAX_ROWS)return null;
 const groups=new Map(),ids=new Set();
 for(const r of rows){
  if(!r||typeof r!=="object"||typeof r.id!=="string"||!UUID.test(r.id)||
   ids.has(r.id)||!Number.isInteger(r.source_row)||r.source_row<2||
   typeof r.parent_title!=="string"||!r.parent_title.trim()||r.parent_title.length>120||
   typeof r.source_section!=="string"||typeof r.strength!=="string"||
   typeof r.size!=="string"||typeof r.review_note!=="string"||
   !["","MCT","GSO"].includes(r.carrier_oil)||
   !["pending_review","needs_clarification"].includes(r.review_status))return null;
  ids.add(r.id);
  const name=r.parent_title.trim();
  if(!groups.has(name))groups.set(name,{
   name,section:r.source_section,anchor:"variant-"+r.source_row,
   sourceRow:r.source_row,options:[],compositionByVariantId:{},held:0,
  });
  const group=groups.get(name);
  if(group.section!==r.source_section)return null;
  if(r.source_row<group.sourceRow){
   group.sourceRow=r.source_row;
   group.anchor="variant-"+r.source_row;
  }
  if(r.review_status==="needs_clarification"){
   group.held++;
   continue;
  }
  const price=Number(r.retail_price_cents);
  if(!Number.isSafeInteger(price)||price<1||price>999999999)return null;
  const formula=reviewFormula(r.strength);
  const strength=formula?"":LABEL.test(r.strength)?r.strength:"";
  const size=LABEL.test(r.size)?r.size:"";
  if(formula)group.compositionByVariantId[r.id]=formula;
  group.options.push({
   id:r.id,carrierOil:r.carrier_oil,strength,size,retailPriceCents:price,
  });
 }
 const cards=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
 if(cards.some(card=>card.options.length&&!validateProductOptions(card.options)))return null;
 return cards;
}
