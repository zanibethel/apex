import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAdminSupplierMailHealth}
 from "../src/lib/supplier/admin-mail-delivery-health.mjs";

const payload={
 schema_version:1,scope:"all_supplier_daily_reports",window_days:7,
 webhook_started_at:"2026-11-05T13:49:23.380515+00:00",
 accepted:4,predates_webhook:2,no_signed_event:1,receipt_overdue:1,
 delivered_to_mail_server:1,sent:0,delayed:0,bounced:1,failed:0,
 complained:0,suppressed:0,
 latest_signed_event_at:"2026-11-05T14:05:01.23456+00:00",
 alert_count:2,inbox_delivery_confirmed:false,can_ship:false,
};
const parsed=x=>parseAdminSupplierMailHealth(x,7);

test("valid admin health returns aggregate-only delivery evidence, not recipient data",()=>{
 const result=parsed(payload);
 assert.equal(result.accepted,4);
 assert.equal(result.predatesWebhook,2);
 assert.equal(result.deliveredToMailServer,1);
 assert.equal(result.bounced,1);
 assert.equal(result.alertCount,2);
 assert.equal(result.canShip,false);
 assert.equal(result.inboxDelivered,false);
 assert.equal(Object.isFrozen(result),true);
 for(const key of ["email","recipient","storeId","address","providerEmailId"])
  assert.equal(Object.hasOwn(result,key),false);
});
test("empty event window and microsecond PostgreSQL UTC timestamps are supported",()=>{
 const result=parsed({...payload,accepted:0,predates_webhook:0,
 no_signed_event:0,receipt_overdue:0,delivered_to_mail_server:0,
 bounced:0,alert_count:0,latest_signed_event_at:null});
 assert.ok(result);
 assert.equal(result.latestSignedEventAt,null);
});
test("forged delivery, suppressed alerts, extra PII, stale schema and inconsistent totals fail closed",()=>{
 const cases=[
  {...payload,scope:"supplier_member"},
  {...payload,schema_version:2},
  {...payload,window_days:30},
  {...payload,recipient:"person@example.org"},
  {...payload,inbox_delivery_confirmed:true},
  {...payload,can_ship:true},
  {...payload,receipt_overdue:3},
  {...payload,alert_count:1},
  {...payload,bounced:-1},
  {...payload,predates_webhook:9},
  {...payload,latest_signed_event_at:"yesterday"},
  {...payload,webhook_started_at:"invalid"},
 ];
 for(const value of cases)assert.equal(parsed(value),null);
});
test("admin page verifies trusted identity and never renders raw provider IDs or addresses",()=>{
 const page=readFileSync("src/app/admin/email-reports/page.tsx","utf8");
 const migration=readFileSync(
  "supabase/migrations/20261105160000_apex_admin_supplier_mail_delivery_health.sql","utf8");
 const workflow=readFileSync(".github/workflows/payout-rls.yml","utf8");
 assert.match(page,/isVerifiedPlatformAdmin/);
 assert.match(page,/get_admin_supplier_mail_delivery_health/);
 assert.match(page,/parseAdminSupplierMailHealth/);
 assert.match(page,/Delivery monitoring/);
 assert.match(page,/receiptOverdue/);
 assert.match(page,/predatesWebhook/);
 assert.match(migration,/app_metadata,apex_role/);
 assert.match(migration,/email_confirmed_at is not null/);
 assert.match(migration,/revoke all on function public.get_admin_supplier_mail_delivery_health/);
 assert.match(migration,/grant execute on function public.get_admin_supplier_mail_delivery_health/);
 assert.match(migration,/supplier_report_delivery_events/);
 assert.match(migration,/predates_webhook/);
 assert.match(migration,/receipt_overdue/);
 assert.match(workflow,/admin-supplier-mail-health.sql/);
 assert.doesNotMatch(page,/service_role|customer_address|provider_email_id|shipping_address/i);
 assert.doesNotMatch(migration,/update apex_internal.supplier_daily_report_email_outbox|update public.supplier_sales_history|insert into.*checkout_order_intents/i);
});
