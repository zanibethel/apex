/**
 * Issue #215: strictly validate a review-only tracking draft request and
 * the private isolated database receipt. Never interpret tracking as shipped.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TRACK=/^[A-Z0-9]{8,40}$/;
const CARRIERS=new Set(['USPS','UPS','FEDEX','DHL']);
const RESULTS=new Set(['draft_saved','identical_replay',
 'stale_version','duplicate_conflict']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
export function parseSupplierTrackingDraftRequest(input){
 if(!exact(input,['storeId','shipmentId','requestId',
  'expectedRevision','carrier','trackingReference']))return null;
 if(!UUID.test(input.storeId??'')||!UUID.test(input.shipmentId??'')||
  !UUID.test(input.requestId??'')||
  !Number.isSafeInteger(input.expectedRevision)||
  input.expectedRevision<1||input.expectedRevision>999||
  !CARRIERS.has(input.carrier)||
  typeof input.trackingReference!=='string')return null;
 const tracking=input.trackingReference.trim().toUpperCase();
 if(!TRACK.test(tracking))return null;
 return Object.freeze({
  storeId:input.storeId,shipmentId:input.shipmentId,
  requestId:input.requestId,
  expectedRevision:input.expectedRevision,carrier:input.carrier,
  trackingReference:tracking,
 });
}
export function parseSupplierTrackingDraftReceipt(data,expectedRevision){
 if(!exact(data,['status','expected_revision','observed_revision',
  'latest_carrier','latest_tracking_reference',
  'shipped','carrier_verified','label_purchased'])||
  !RESULTS.has(data.status)||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
  data.expected_revision!==expectedRevision||
  !Number.isSafeInteger(data.observed_revision)||
  data.observed_revision<1||data.observed_revision>1000||
  data.shipped!==false||data.carrier_verified!==false||
  data.label_purchased!==false)return null;
 const lastCarrier=data.latest_carrier;
 const lastTracking=data.latest_tracking_reference;
 if((lastCarrier===null)!==(lastTracking===null)||
  (lastCarrier!==null&&
   (!CARRIERS.has(lastCarrier)||typeof lastTracking!=='string'||
    !TRACK.test(lastTracking))))return null;
 if((data.status==='draft_saved'||
  data.status==='identical_replay')&&
  (lastCarrier===null||data.observed_revision<expectedRevision+1))return null;
 if((data.status==='stale_version'||
  data.status==='duplicate_conflict')&&
  data.observed_revision===expectedRevision&&lastCarrier===null)
  return null;
 return Object.freeze({
  kind:data.status,expectedRevision,
  observedRevision:data.observed_revision,
  latestCarrier:lastCarrier,latestTracking:lastTracking,
  canShip:false,canBuyLabel:false,canMarkDelivered:false,
 });
}
