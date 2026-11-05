import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSupplierReportDeliveryStatus,describeSupplierMailStatus}
 from "../src/lib/supplier/supplier-report-delivery-status.mjs";

const store="62000000-0000-0000-0000-000000000001";
const other="62000000-0000-0000-0000-000000000002";
const day="2026-11-05";
const accepted={
 schema_version:1,store_id:store,report_date:day,
 state:"provider_accepted",provider_accepted:true,
 provider_event_type:null,provider_event_at:null,
 inbox_delivery_confirmed:false,can_ship:false,
};
const event=(state,kind)=>({
 ...accepted,state,provider_event_type:kind,
 provider_event_at:"2026-11-05T15:05:00.000Z",
});

test("no email and accepted email are visibly different; neither implies delivery",()=>{
 const never={...accepted,state:"not_sent",provider_accepted:false};
 const a=parseSupplierReportDeliveryStatus(never,store,day);
 const b=parseSupplierReportDeliveryStatus(accepted,store,day);
 assert.equal(a.state,"not_sent");
 assert.equal(b.state,"provider_accepted");
 assert.equal(b.inboxDelivered,false);
 assert.equal(b.canShip,false);
 assert.match(describeSupplierMailStatus(b),/not yet confirmed/);
});

test("signed provider delivery means mail-server event, never confirmed inbox",()=>{
 const parsed=parseSupplierReportDeliveryStatus(event(
  "provider_delivered","email.delivered"),store,day);
 assert.equal(parsed.state,"provider_delivered");
 assert.equal(parsed.eventType,"email.delivered");
 assert.equal(parsed.inboxDelivered,false);
 assert.match(describeSupplierMailStatus(parsed),/mail server/);
 assert.match(describeSupplierMailStatus(parsed),/inbox placement is not verified/);
});

test("bounced, complained, delayed, failed, suppressed, sent are distinct",()=>{
 for(const [state,kind] of [
  ["provider_bounced","email.bounced"],
  ["provider_complained","email.complained"],
  ["provider_delayed","email.delivery_delayed"],
  ["provider_failed","email.failed"],
  ["provider_suppressed","email.suppressed"],
  ["provider_sent","email.sent"],
 ]){
  const parsed=parseSupplierReportDeliveryStatus(event(state,kind),store,day);
  assert.ok(parsed);
  assert.equal(parsed.state,state);
  assert.equal(parsed.canShip,false);
  assert.ok(describeSupplierMailStatus(parsed).length>20);
 }
});

test("wrong store, extra recipient fields, invented inbox proof and forged states fail closed",()=>{
 for(const payload of [
  {...accepted,store_id:other},
  {...accepted,recipient_email:"user@example.org"},
  {...accepted,inbox_delivery_confirmed:true},
  {...accepted,can_ship:true},
  {...accepted,state:"provider_delivered"},
  {...accepted,provider_event_type:"email.delivered"},
  {...accepted,provider_event_at:"2026-11-05T18:00:00Z"},
  {...accepted,provider_accepted:false},
  {...accepted,schema_version:2},
  event("provider_delivered","email.bounced"),
  {...event("provider_delivered","email.delivered"),provider_event_at:"bad date"},
 ])assert.equal(parseSupplierReportDeliveryStatus(payload,store,day),null);
 assert.equal(parseSupplierReportDeliveryStatus(accepted,other,day),null);
});

test("route uses raw bounded Svix HMAC validation before DB RPC and never logs private payload",()=>{
 const route=readFileSync(
  "src/app/api/webhooks/resend-supplier-reports/route.ts","utf8");
 const page=readFileSync("src/app/supplier/reports/daily/page.tsx","utf8");
 assert.match(route,/verifyResendReportEvent/);
 assert.match(route,/svix-id/);
 assert.match(route,/svix-timestamp/);
 assert.match(route,/svix-signature/);
 assert.match(route,/RESEND_REPORT_WEBHOOK_SECRET/);
 assert.match(route,/APEX_REPORT_DISPATCH_TOKEN/);
 assert.match(route,/65536/);
 assert.match(route,/record_supplier_daily_report_delivery_event/);
 assert.match(route,/responseHeaders/);
 assert.match(page,/get_supplier_daily_report_delivery_status/);
 assert.match(page,/parseSupplierReportDeliveryStatus/);
 assert.match(page,/describeSupplierMailStatus/);
 assert.doesNotMatch(route,/service_role|console\.log|customer_address|markShipped|purchaseLabel|order_line/i);
});

test("database journal is private, atomically idempotent and never changes settled orders",()=>{
 const migration=readFileSync(
  "supabase/migrations/20261105134500_apex_supplier_report_delivery_events.sql",
  "utf8");
 const workflow=readFileSync(".github/workflows/payout-rls.yml","utf8");
 assert.match(migration,/force row level security/);
 assert.match(migration,/references apex_internal\.supplier_daily_report_email_outbox\(id\)/);
 assert.match(migration,/on conflict\(event_id\) do nothing/);
 assert.match(migration,/v_matches<>1/);
 assert.match(migration,/v_prior\.event_type is distinct from p_event_type/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/supplier_memberships/);
 assert.match(migration,/grant execute on function public\.get_supplier_daily_report_delivery_status/);
 assert.match(workflow,/supplier-report-delivery-events\.sql/);
 assert.doesNotMatch(migration,/insert into (?:public\.)?orders|update (?:public\.)?supplier_sales_history|mark_shipped|purchase_label/i);
});
