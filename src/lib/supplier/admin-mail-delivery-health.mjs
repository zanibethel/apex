/** Strict, PII-free owner delivery health projection. No shipment rights. */
const KEYS=[
 "schema_version","scope","window_days","webhook_started_at",
 "accepted","predates_webhook","no_signed_event","receipt_overdue",
 "delivered_to_mail_server","sent","delayed","bounced","failed",
 "complained","suppressed","latest_signed_event_at","alert_count",
 "inbox_delivery_confirmed","can_ship"
];
const COUNT=[
 "accepted","predates_webhook","no_signed_event","receipt_overdue",
 "delivered_to_mail_server","sent","delayed","bounced","failed",
 "complained","suppressed","alert_count"
];
function iso(value){
 return typeof value==="string"&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)&&
  Number.isFinite(Date.parse(value));
}
export function parseAdminSupplierMailHealth(value,requestedDays=7){
 if(!value||typeof value!=="object"||Array.isArray(value)||
  Object.keys(value).sort().join(",")!==KEYS.slice().sort().join(",")||
  value.schema_version!==1||
  value.scope!=="all_supplier_daily_reports"||
  value.window_days!==requestedDays||
  !Number.isInteger(requestedDays)||requestedDays<1||requestedDays>30||
  value.inbox_delivery_confirmed!==false||value.can_ship!==false||
  !iso(value.webhook_started_at)||
  (value.latest_signed_event_at!==null&&!iso(value.latest_signed_event_at))||
  !COUNT.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0))
  return null;
 if(value.predates_webhook+value.no_signed_event>value.accepted||
  value.receipt_overdue>value.no_signed_event||
  value.alert_count!==value.receipt_overdue+value.delayed+value.bounced+
   value.failed+value.complained+value.suppressed||
  value.delivered_to_mail_server+value.sent+value.delayed+value.bounced+
   value.failed+value.complained+value.suppressed+
   value.no_signed_event+value.predates_webhook<value.accepted)
  return null;
 // The latest event types only account for messages with signed receipts;
 // legacy pre-webhook reports must not be counted as failed.
 return Object.freeze({
  accepted:value.accepted,predatesWebhook:value.predates_webhook,
  noSignedEvent:value.no_signed_event,receiptOverdue:value.receipt_overdue,
  deliveredToMailServer:value.delivered_to_mail_server,sent:value.sent,
  delayed:value.delayed,bounced:value.bounced,failed:value.failed,
  complained:value.complained,suppressed:value.suppressed,
  alertCount:value.alert_count,latestSignedEventAt:value.latest_signed_event_at,
  webhookStartedAt:value.webhook_started_at,days:requestedDays,
  inboxDelivered:false,canShip:false
 });
}
