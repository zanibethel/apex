/**
 * Server-side planning contract for real-cart admission. This module is
 * deliberately NOT a purchaser-facing authorization or checkout service.
 *
 * Source: authenticated private get_private_release_readiness RPC only.
 * The current SQL hardcodes effective_public=false and release_enabled=false.
 * Never infer "sellable" from a supplier's publication preference alone.
 *
 * A future transactional implementation requires a NEW reviewed database
 * admission/price/inventory transaction plus merchant/legal checks. There
 * is intentionally NO success path that accepts real merchandise here.
 */
const CHECKS=Object.freeze([
 Object.freeze({key:"supplier_requested",label:"Supplier requested publication"}),
 Object.freeze({key:"admin_clear",label:"Admin holds and reviews cleared"}),
 Object.freeze({key:"same_supplier_identity_clear",label:"Supplier identity conflicts cleared"}),
 Object.freeze({key:"content_review_clear",label:"Content review cleared"}),
 Object.freeze({key:"product_setup_complete",label:"Required product details complete"}),
 Object.freeze({key:"stock_available",label:"Available stock checked privately"}),
 Object.freeze({key:"supplier_authorized",label:"Seller authorization independently verified"}),
 Object.freeze({key:"product_authorized",label:"Product authorization independently verified"}),
 Object.freeze({key:"public_release_enabled",label:"Public catalog release authorized"}),
]);
export const PRIVATE_CHECKOUT_READINESS_CHECKS=CHECKS;

export function evaluatePrivateCheckoutReadiness(snapshot,serverMode){
 const mode=serverMode==="demo"?"demo":"disabled";
 const checks=snapshot&&typeof snapshot==="object"&&!Array.isArray(snapshot)
  &&snapshot.checks&&typeof snapshot.checks==="object"&&!Array.isArray(snapshot.checks)
  ?snapshot.checks:null;
 const verified=Boolean(checks)&&
  typeof snapshot.status_code==="string"&&snapshot.status_code.length<=100&&
  snapshot.effective_public===false&&
  CHECKS.every(item=>typeof checks[item.key]==="boolean");
 const statuses=CHECKS.map(item=>Object.freeze({
   key:item.key,label:item.label,
   state:verified?(checks[item.key]?"passed":"blocked"):"unverified",
 }));
 const missing=statuses.filter(item=>item.state!=="passed").map(item=>item.key);
 const blockers=verified
  ?[...missing,"checkout_provider_not_approved","server_order_admission_disabled"]
  :["private_release_decision_unverified","checkout_provider_not_approved","server_order_admission_disabled"];
 // Declared "passed" fields are PRIVATE PRECHECKS, not commercial eligibility.
 // No amount/price, order permission or public checkout token is returned.
 return Object.freeze({
  mode,verifiedPrivateReleaseReadback:verified,
  privateStatusCode:verified?snapshot.status_code:"unavailable",
  effectivePublic:false,
  canAddToRealCart:false,
  canQuoteRealProduct:false,
  canCreateOrder:false,
  canCreatePayment:false,
  status:"blocked",
  checks:statuses,
  blockers:Object.freeze(blockers),
 });
}
