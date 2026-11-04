/**
 * Issue #215: descriptive fulfillment state model, NOT an execution engine.
 * All transitions fail closed while merchant, purchase, shipping and carrier
 * approvals are unavailable; input "approved" flags never unlock a path.
 */
export const FULFILLMENT_STATES=Object.freeze([
 'queued','under_review','packing','label_ready','shipped',
 'delivered','exception','cancelled',
]);
const transitions=Object.freeze({
 queued:Object.freeze(['under_review','cancelled']),
 under_review:Object.freeze(['packing','exception','cancelled']),
 packing:Object.freeze(['label_ready','exception','cancelled']),
 label_ready:Object.freeze(['shipped','exception','cancelled']),
 shipped:Object.freeze(['delivered','exception']),
 delivered:Object.freeze([]),
 exception:Object.freeze(['under_review','cancelled']),
 cancelled:Object.freeze([]),
});
const known=new Set(FULFILLMENT_STATES);
const isInt=x=>Number.isSafeInteger(x)&&x>=1&&x<=1000;
function reject(reason,from,to,revision){
 return Object.freeze({
  recognizedTransition:known.has(from)&&known.has(to)&&
   transitions[from].includes(to),
  status:reason,observedRevision:isInt(revision)?revision:null,
  canTransition:false,canPurchaseLabel:false,canShip:false,
  canDeliver:false,commitAllowed:false,
 });
}
export function reviewFulfillmentTransition({
 from,to,expectedRevision,observedRevision,
}={}){
 if(!known.has(from)||!known.has(to))return reject(
  'unknown_state',from,to,observedRevision);
 if(!isInt(expectedRevision)||!isInt(observedRevision))
  return reject('invalid_version',from,to,observedRevision);
 if(expectedRevision!==observedRevision)
  return reject('stale_version',from,to,observedRevision);
 if(!transitions[from].includes(to))
  return reject('unsupported_transition',from,to,observedRevision);
 // Even if a caller supplies approved eligibility booleans, authority must
 // come from separately reviewed authenticated database/merchant evidence.
 return reject('not_authorized_for_execution',from,to,observedRevision);
}
export function summarizeReviewAllocations(lines){
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)
  return null;
 const rows=[],refs=new Set();
 let requested=0,alreadyPlanned=0,remaining=0;
 for(const line of lines){
  if(!line||typeof line!=='object'||Array.isArray(line)||
   Object.keys(line).length!==4||
   typeof line.lineId!=='string'||!/^[0-9a-f-]{36}$/i.test(line.lineId)||
   refs.has(line.lineId)||
   ![line.purchasedQuantity,line.plannedQuantity,line.newPlanQuantity]
    .every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100)||
   line.purchasedQuantity<1||
   line.plannedQuantity>line.purchasedQuantity||
   line.newPlanQuantity>line.purchasedQuantity-line.plannedQuantity)
   return null;
  refs.add(line.lineId);
  requested+=line.newPlanQuantity;
  alreadyPlanned+=line.plannedQuantity;
  remaining+=line.purchasedQuantity-line.plannedQuantity-line.newPlanQuantity;
  rows.push(Object.freeze({
   lineId:line.lineId,
   purchasedQuantity:line.purchasedQuantity,
   alreadyPlannedQuantity:line.plannedQuantity,
   proposedQuantity:line.newPlanQuantity,
   remainingUnplannedQuantity:line.purchasedQuantity-
    line.plannedQuantity-line.newPlanQuantity,
  }));
 }
 return Object.freeze({
  plannedOnly:true,canShip:false,canReserveInventory:false,
  requestedUnits:requested,alreadyPlannedUnits:alreadyPlanned,
  remainingUnplannedUnits:remaining,
  partiallyPlanned:remaining>0,
  lines:Object.freeze(rows),
 });
}
