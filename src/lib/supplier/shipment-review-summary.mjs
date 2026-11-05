/**
 * Issue #247: summarize immutable HELD-order metadata for review only.
 * Does not create shipment plans, assess payment, or grant fulfillment rights.
 */
import {HELD_HEADER_LAST_PAGE} from "./held-order-header-page.mjs";

const PATH="/supplier/reports/shipment-review";

export function shipmentReviewHref(page){
 if(!Number.isSafeInteger(page)||page<0||page>HELD_HEADER_LAST_PAGE)
  throw new RangeError("Shipment review page out of range");
 return page===0?PATH:PATH+"?page="+String(page);
}

export function summarizeHeldShipmentReview(headers,storeId){
 if(!headers||headers.storeId!==storeId||
  !Array.isArray(headers.orders)||
  !Number.isSafeInteger(headers.total)||headers.total<0||
  !Number.isSafeInteger(headers.offset)||headers.offset<0||
  headers.canShip!==false||headers.canPay!==false||
  headers.sourceAttested!==false)return null;
 let missingLineSnapshots=0,missingSealedDestinations=0,recordedConfirmed=0;
 for(const order of headers.orders){
  if(!order||order.status!=="held_unverified"||
   order.canShip!==false||order.canPay!==false||
   !Number.isSafeInteger(order.storedLineCount)||
   order.storedLineCount<0||
   typeof order.destinationSealed!=="boolean")return null;
  if(order.storedLineCount===0)missingLineSnapshots++;
  if(!order.destinationSealed)missingSealedDestinations++;
  if(order.recordedSaleState==="confirmed")recordedConfirmed++;
 }
 return Object.freeze({
  totalHeld:headers.total,
  pageRecords:headers.orders.length,
  pageMissingLineSnapshots:missingLineSnapshots,
  pageMissingSealedDestinations:missingSealedDestinations,
  pageRecordedConfirmedObservations:recordedConfirmed,
  independentlyEligible:0,
  mayPrintLabels:false,
  mayShip:false,
  maySendFulfillmentEmail:false,
  sourceType:"held_metadata_only",
 });
}
