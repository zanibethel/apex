/**
 * Strict versioned supplier report-mail evidence projection.
 * Accepted != delivered; delivered is provider mail-server evidence only.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const STATES=new Set([
 "not_sent","provider_accepted","provider_sent","provider_delivered",
 "provider_bounced","provider_complained","provider_failed",
 "provider_delayed","provider_suppressed",
]);
const EVENTS=new Set([
 "email.sent","email.delivered","email.bounced","email.complained",
 "email.failed","email.delivery_delayed","email.suppressed",
]);
const EXACT=[
 "schema_version","store_id","report_date","state","provider_accepted",
 "provider_event_type","provider_event_at","inbox_delivery_confirmed",
 "can_ship",
];
export function parseSupplierReportDeliveryStatus(input,storeId,day){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  typeof storeId!=="string"||!UUID.test(storeId)||
  typeof day!=="string"||!DAY.test(day)||
  Object.keys(input).sort().join(",")!==EXACT.slice().sort().join(",")||
  input.schema_version!==1||input.store_id!==storeId||
  input.report_date!==day||!STATES.has(input.state)||
  typeof input.provider_accepted!=="boolean"||
  input.inbox_delivery_confirmed!==false||input.can_ship!==false)
  return null;
 const event=input.provider_event_type;
 const at=input.provider_event_at;
 if((event===null)!==(at===null))return null;
 if(event!==null&&(!EVENTS.has(event)||
  typeof at!=="string"||!Number.isFinite(Date.parse(at))))
  return null;
 const mapped=event===null?"provider_accepted":
  ({ "email.sent":"provider_sent",
     "email.delivered":"provider_delivered",
     "email.bounced":"provider_bounced",
     "email.complained":"provider_complained",
     "email.failed":"provider_failed",
     "email.delivery_delayed":"provider_delayed",
     "email.suppressed":"provider_suppressed" })[event];
 if(!input.provider_accepted){
  if(input.state!=="not_sent"||event!==null)return null;
 }else if(input.state!==mapped)return null;
 return Object.freeze({
  state:input.state,
  accepted:input.provider_accepted,
  eventType:event,
  eventAt:at,
  inboxDelivered:false,
  canShip:false,
 });
}
export function describeSupplierMailStatus(status){
 if(!status)return "Email delivery status is unavailable; no delivery claim can be made.";
 const descriptions={
  not_sent:"No provider-accepted email is recorded for this date.",
  provider_accepted:"Resend accepted the report; delivery is not yet confirmed.",
  provider_sent:"Resend reports that the message was sent; delivery is not confirmed.",
  provider_delivered:"Resend reports delivery to the recipient's mail server; inbox placement is not verified.",
  provider_bounced:"Resend reports the message bounced. Review the verified login email.",
  provider_complained:"Resend reports a complaint. Review the subscription before future reports.",
  provider_failed:"Resend reports a sending failure. Delivery requires attention.",
  provider_delayed:"Resend reports delayed delivery; awaiting another provider event.",
  provider_suppressed:"Resend reports the message was suppressed and not delivered.",
 };
 return descriptions[status.state]??"Provider status unavailable.";
}

/**
 * Only the existing Apex supplier DAILY report subject is eligible for
 * this journal; owner weekly digests and other Resend projects are ignored.
 * Call only AFTER verifying the signed raw provider payload.
 */
export function isSupplierDailyReportPayload(signedPayload){
 if(typeof signedPayload!=="string"||signedPayload.length>65536)
  return false;
 try{
  const event=JSON.parse(signedPayload);
  const subject=event?.data?.subject;
  return typeof subject==="string"&&
   /^Apex daily order report — \d{4}-\d{2}-\d{2}$/.test(subject);
 }catch{return false;}
}
