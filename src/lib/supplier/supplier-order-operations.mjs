/**
 * Private supplier operations overview. Combines strictly parsed, RLS-scoped
 * READ-ONLY sources; it never confers checkout, shipment or label authority.
 */
export const SUPPLIER_ORDER_VIEW_LIMIT=25;
const RECORDED_STATES=Object.freeze({
 pending:"Recorded pending",
 confirmed:"Recorded confirmed — settlement not verified",
 refunded:"Recorded refunded",
 cancelled:"Recorded cancelled",
});
export function recordedOrderObservation(state){
 return Object.hasOwn(RECORDED_STATES,state)?
  RECORDED_STATES[state]:"Recorded state unavailable";
}
export function summarizeSupplierOperations(headers,details,usps){
 if(headers!==null&&(
  !headers||headers.canShip!==false||headers.canPay!==false||
  headers.sourceAttested!==false||
  !Array.isArray(headers.orders)||
  !Number.isSafeInteger(headers.total)||headers.total<0||
  headers.orders.length>SUPPLIER_ORDER_VIEW_LIMIT||
  headers.orders.some(row=>!row||typeof row!=="object"||
    row.status!=="held_unverified"||
    row.canShip!==false||row.canPay!==false)
 ))return null;
 if(details!==null&&(
  !details||details.canImportOrders!==false||
  details.canShip!==false||details.canCollectPayments!==false||
  !Number.isSafeInteger(details.orders)||details.orders<0||
  !Number.isSafeInteger(details.lines)||details.lines<0
 ))return null;
 if(usps!==null&&(
  !usps||usps.canPurchaseLabel!==false||usps.trackingSync!==false||
  !["not_connected","pending_authorization","verified"].includes(usps.status)
 ))return null;
 const held=headers?.total??null;
 const lines=details?.lines??null;
 const sealed=details?.destinationsSealed??null;
 const missingOnPage=headers?.orders.filter(x=>x.storedLineCount===0).length??null;
 return Object.freeze({
  held,shown:headers?.orders.length??null,
  recordedLineSnapshots:lines,
  sealedDeliveryRecords:sealed,
  missingLineSnapshotsThisPage:missingOnPage,
  uspsStatus:usps?.status??null,
  canShip:false,canPurchaseLabels:false,canPay:false,
  canSeeDeliveryAddresses:false,
  sourceVerified:false,
  // A recorded "confirmed" sale can never establish payment finality.
  requiresIndependentVerification:true,
  recordsReady:headers!==null,
  foundationReady:details!==null,
  carrierReady:usps!==null,
 });
}
