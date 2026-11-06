import {
 supplierParentSnapshot,sameSupplierParentSnapshot,reviewFormula,
} from "./supplier-parent-review-snapshot.mjs";
import {validateProductOptions} from "./product-option-picker-v1.mjs";

// Read-only grouping of an RLS-protected source batch. Never converts an
// unverified source row into an authoritative product/SKU or available stock.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAIN_LABEL=/^[A-Za-z0-9][A-Za-z0-9 .,_()+-]{0,39}$/;

function safeCents(v){
 if(v==null)return null;
 const n=Number(v);
 return Number.isSafeInteger(n)&&n>0&&n<=999999999?n:null;
}
export function buildSupplierSheetCards(rows,events=[]){
 if(!Array.isArray(rows)||rows.length>250||!Array.isArray(events)||events.length>500)return null;
 const parents=new Map(),ids=new Set();
 for(const r of rows){
  if(!r||typeof r!=="object"||typeof r.id!=="string"||!UUID.test(r.id)||ids.has(r.id)||
   !Number.isSafeInteger(r.source_row)||r.source_row<2||
   typeof r.parent_title!=="string"||!r.parent_title.trim()||r.parent_title.length>120||
   typeof r.source_name!=="string"||typeof r.source_section!=="string"||
   typeof r.strength!=="string"||typeof r.size!=="string"||
   typeof r.review_note!=="string"||
   !["","MCT","GSO"].includes(r.carrier_oil)||
   !["pending_review","needs_clarification"].includes(r.review_status))return null;
  ids.add(r.id);
  const name=r.parent_title.trim();
  if(!parents.has(name))parents.set(name,{name,section:r.source_section,rows:[],options:[],held:[],compositionByVariantId:{}});
  const p=parents.get(name);
  if(p.section!==r.source_section)return null;
  p.rows.push(r);
  const price=safeCents(r.retail_price_cents);
  if(r.review_status!=="pending_review"||price===null){
   p.held.push({row:r.source_row,sourceName:r.source_name,reason:r.review_note,formula:r.strength});
   continue;
  }
  const formula=reviewFormula(r.strength);
  if(formula)p.compositionByVariantId[r.id]=formula;
  p.options.push({
   id:r.id,carrierOil:r.carrier_oil,
   strength:formula?"":(PLAIN_LABEL.test(r.strength)?r.strength:""),
   size:PLAIN_LABEL.test(r.size)?r.size:"",
   retailPriceCents:price,
  });
 }
 const latest=new Map();
 for(const ev of events){
  if(!ev||typeof ev.parent_title!=="string"||
    !["approved","needs_changes"].includes(ev.decision)||!Number.isSafeInteger(ev.id))return null;
  if(!latest.has(ev.parent_title))latest.set(ev.parent_title,ev);
 }
 const result=[];
 for(const parent of parents.values()){
  const snapshot=supplierParentSnapshot(parent.rows);
  if(!snapshot)return null;
  if(parent.options.length&&!validateProductOptions(parent.options))return null;
  const event=latest.get(parent.name);
  const reviewStatus=event&&sameSupplierParentSnapshot(event.reviewed_snapshot,snapshot)?
   event.decision==="approved"?"approved":"needs_changes":
   event?"source_changed":"pending";
  result.push({
   name:parent.name,section:parent.section,options:parent.options,
   compositionByVariantId:parent.compositionByVariantId,
   held:parent.held,canApprove:parent.held.length===0&&parent.options.length>0,
   snapshotJson:JSON.stringify(snapshot),
   reviewStatus,
  });
 }
 return Object.freeze(result.sort((a,b)=>a.name.localeCompare(b.name)));
}
export function productWorkspaceStatus(row){
 if(!row||typeof row!=="object")return "draft";
 if(row.adminGate==="hold")return "held";
 if(row.requested===true)return "requested";
 return row.published===true?"published":"draft";
}
export function filterProductWorkspace(rows,query="",filter="all",kind="sheet"){
 const term=String(query).trim().toLocaleLowerCase();
 const allowed=["all","needs_attention","approved","requested","draft","held"];
 const type=kind==="saved"?"saved":"sheet";
 const state=allowed.includes(filter)?filter:"all";
 return (rows??[]).filter(row=>{
  if(term&&![
   row.name,row.section,row.sku,
   ...(row.options??[]).map(v=>[v.strength,v.size,v.carrierOil].join(" ")),
  ].some(value=>String(value??"").toLocaleLowerCase().includes(term)))return false;
  if(state==="all")return true;
  if(type==="sheet"){
   if(state==="approved")return row.reviewStatus==="approved";
   if(state==="needs_attention")return row.held?.length>0||
     ["needs_changes","source_changed"].includes(row.reviewStatus);
   if(state==="draft")return row.reviewStatus==="pending";
   return false;
  }
  const status=productWorkspaceStatus(row);
  if(state==="needs_attention")return status==="held";
  return status===state;
 });
}
