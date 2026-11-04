const DAY=/^\d{4}-\d{2}-\d{2}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MONEY=/^(?:0|[1-9]\d{0,17})$/;
const NAT=n=>Number.isSafeInteger(n)&&n>=0;
const CENTS=n=>typeof n==="string"&&MONEY.test(n)&&Number.isSafeInteger(Number(n));
const FIELDS=["schema_version","status","store_id","report_date","time_zone"];
const EXTRA=["generated_at","recorded_order_count","pending_order_count",
 "confirmed_order_count","refunded_order_count","cancelled_order_count",
 "pending_gross_cents","confirmed_gross_cents","refunded_gross_cents",
 "confirmed_btc_sats","email_delivered"];
const sameKeys=(input,fields)=>Object.keys(input).sort().join(",")===
 [...fields].sort().join(",");
export const REPORT_ZONE="America/Chicago";

export function centralDateKey(when=new Date()){
 const dt=when instanceof Date?when:new Date(when);
 if(!Number.isFinite(dt.getTime()))return null;
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:REPORT_ZONE,year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(dt);
 const value=type=>parts.find(p=>p.type===type)?.value;
 return [value("year"),value("month"),value("day")].join("-");
}
export function previousCentralDate(when=new Date()){
 const today=centralDateKey(when);
 if(!today||!DAY.test(today))return null;
 const date=new Date(today+"T00:00:00.000Z");
 if(Number.isNaN(date.getTime()))return null;
 date.setUTCDate(date.getUTCDate()-1);
 return date.toISOString().slice(0,10);
}
export function validReportDate(value,now=new Date()){
 if(typeof value!=="string"||!DAY.test(value))return false;
 const dt=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==value)return false;
 const today=centralDateKey(now);
 const min=new Date(today+"T00:00:00.000Z");
 min.setUTCDate(min.getUTCDate()-400);
 return value<=today&&value>=min.toISOString().slice(0,10);
}
export function parseSupplierDailyReport(input,storeId,day){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  !UUID.test(storeId)||!validReportDate(day)||
  input.schema_version!==1||input.store_id!==storeId||
  input.report_date!==day||input.time_zone!==REPORT_ZONE)return null;
 if(input.status==="not_generated"){
  return sameKeys(input,FIELDS)?Object.freeze({
   status:"not_generated",day,storeId,
  }):null;
 }
 if(input.status!=="generated"||!sameKeys(input,[...FIELDS,...EXTRA])||
  typeof input.generated_at!=="string"||
  !Number.isFinite(Date.parse(input.generated_at))||
  input.email_delivered!==false||
  !NAT(input.recorded_order_count)||
  !NAT(input.pending_order_count)||!NAT(input.confirmed_order_count)||
  !NAT(input.refunded_order_count)||!NAT(input.cancelled_order_count)||
  !CENTS(input.pending_gross_cents)||
  !CENTS(input.confirmed_gross_cents)||
  !CENTS(input.refunded_gross_cents)||
  !CENTS(input.confirmed_btc_sats)||
  input.pending_order_count+input.confirmed_order_count+
   input.refunded_order_count+input.cancelled_order_count!==
    input.recorded_order_count)return null;
 return Object.freeze({
  status:"generated",day,storeId,generatedAt:input.generated_at,
  recordedOrders:input.recorded_order_count,
  pendingOrders:input.pending_order_count,
  confirmedOrders:input.confirmed_order_count,
  refundedOrders:input.refunded_order_count,
  cancelledOrders:input.cancelled_order_count,
  pendingGrossCents:Number(input.pending_gross_cents),
  confirmedGrossCents:Number(input.confirmed_gross_cents),
  refundedGrossCents:Number(input.refunded_gross_cents),
  confirmedBtcSats:Number(input.confirmed_btc_sats),
  emailDelivered:false,
 });
}
export function parseSupplierUspsReadiness(input,storeId){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  !UUID.test(storeId)||!sameKeys(input,[
   "schema_version","store_id","connection_status","postage_payer",
   "can_purchase_label","tracking_sync_enabled","account_authorization_required"
  ])||input.schema_version!==1||input.store_id!==storeId||
  !["not_connected","pending_authorization","verified"].includes(input.connection_status)||
  input.postage_payer!=="supplier"||
  input.can_purchase_label!==false||input.tracking_sync_enabled!==false||
  input.account_authorization_required!==true)return null;
 return Object.freeze({status:input.connection_status,postagePayer:"supplier",
  canPurchaseLabel:false,trackingSync:false});
}
