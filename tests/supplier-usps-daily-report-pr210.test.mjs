import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 centralDateKey,previousCentralDate,validReportDate,
 parseSupplierDailyReport,parseSupplierUspsReadiness,
} from "../src/lib/supplier/daily-order-report.mjs";
const read=p=>readFileSync(p,"utf8");
const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const now=new Date("2026-11-03T14:00:00.000Z");
const day="2026-11-02";
const item={
 schema_version:1,status:"generated",store_id:store,report_date:day,
 time_zone:"America/Chicago",generated_at:"2026-11-03T12:00:00Z",
 recorded_order_count:3,pending_order_count:1,confirmed_order_count:1,
 refunded_order_count:1,cancelled_order_count:0,
 pending_gross_cents:"4000",confirmed_gross_cents:"8000",
 refunded_gross_cents:"1500",confirmed_btc_sats:"45000",
 email_delivered:false,
};
test("Central day calculations handle DST switches",()=>{
 assert.equal(centralDateKey(now),"2026-11-03");
 assert.equal(previousCentralDate(now),"2026-11-02");
 assert.equal(centralDateKey(new Date("2026-03-08T05:59:00Z")),"2026-03-07");
 assert.equal(centralDateKey(new Date("2026-03-08T06:00:00Z")),"2026-03-08");
 assert.equal(previousCentralDate(new Date("2026-03-08T06:02:00Z")),"2026-03-07");
 assert.equal(centralDateKey(new Date("2026-11-01T04:59:00Z")),"2026-10-31");
 assert.equal(centralDateKey(new Date("2026-11-01T05:00:00Z")),"2026-11-01");
 assert.equal(previousCentralDate(new Date("2026-11-01T14:00:00Z")),"2026-10-31");
});
test("date selector rejects impossible, future and oversized date ranges",()=>{
 assert.equal(validReportDate(day,now),true);
 for(const d of ["not-a-date","2026-02-30","2027-01-01","2023-01-01",
  "2026-11-04","2026-1-2","2026-09-31","2000-01-01"]){
  assert.equal(validReportDate(d,now),false,d);
 }
});
test("supplier daily report only accepts verified, closed source with no fake mail",()=>{
 // Validation uses current date; replace historical fixed date with previous
 // Central day at execution to keep tests deterministic over CI dates.
 const current=previousCentralDate();
 const valid={...item,report_date:current};
 const parsed=parseSupplierDailyReport(valid,store,current);
 assert.ok(parsed);
 assert.equal(parsed.status,"generated");
 assert.equal(parsed.recordedOrders,3);
 assert.equal(parsed.confirmedGrossCents,8000);
 assert.equal(parsed.refundedGrossCents,1500);
 assert.equal(parsed.emailDelivered,false);
 const empty=parseSupplierDailyReport({
  schema_version:1,status:"not_generated",store_id:store,report_date:current,
  time_zone:"America/Chicago",
 },store,current);
 assert.equal(empty.status,"not_generated");
 for(const invalid of [
  {...valid,email_delivered:true},{...valid,recorded_order_count:4},
  {...valid,pending_gross_cents:"-500"},
  {...valid,confirmed_gross_cents:8000},
  {...valid,confirmed_btc_sats:"90071992547409912"},
  {...valid,customer_email:"private@example.org"},
  {...valid,store_id:"64000000-0000-0000-0000-000000000001"},
  {...valid,time_zone:"UTC"},{...valid,status:"paid"},
 ]){
  assert.equal(parseSupplierDailyReport(invalid,store,current),null,
   JSON.stringify(invalid).slice(0,130));
 }
});
test("USPS supplier scope and purchase gate stay false",()=>{
 const good={
  schema_version:1,store_id:store,connection_status:"not_connected",
  postage_payer:"supplier",can_purchase_label:false,
  tracking_sync_enabled:false,account_authorization_required:true,
 };
 const result=parseSupplierUspsReadiness(good,store);
 assert.equal(result.status,"not_connected");
 assert.equal(result.canPurchaseLabel,false);
 assert.equal(result.trackingSync,false);
 for(const invalid of [
  {...good,connection_status:"connected-with-secret"},
  {...good,postage_payer:"platform"},
  {...good,can_purchase_label:true},
  {...good,tracking_sync_enabled:true},
  {...good,access_token:"leaked"},
 ]){
  assert.equal(parseSupplierUspsReadiness(invalid,store),null);
 }
});
test("supplier dashboard includes reports and USPS; no live label purchase",()=>{
 const home=read("src/app/supplier/page.tsx");
 const report=read("src/app/supplier/reports/daily/page.tsx");
 const usps=read("src/app/supplier/usps/page.tsx");
 const migration=read("supabase/migrations/20261104110000_supplier_usps_daily_reporting_foundation.sql");
 const cron=read("database/sql/apex_activate_supplier_daily_report_cron.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(home,/href="\/supplier\/reports\/daily"/);
 assert.match(home,/href="\/supplier\/usps"/);
 assert.match(report,/getSupplierWorkspace/);
 assert.match(report,/get_supplier_daily_order_report/);
 assert.match(report,/previousCentralDate/);
 assert.match(report,/Email delivery is not/);
 assert.match(usps,/getSupplierWorkspace/);
 assert.match(usps,/get_supplier_usps_readiness/);
 assert.match(usps,/USPS Ship enrollment/);
 assert.match(usps,/Label purchases:<\/strong> Not enabled/);
 assert.doesNotMatch(usps,/createShipment|purchaseLabel|payment_method_id|service_role/);
 assert.match(migration,/supplier_daily_order_reports/);
 assert.match(migration,/force row level security/);
 assert.match(migration,/auth.uid\(\)/);
 assert.match(migration,/connection_status.*pending_authorization/);
 assert.doesNotMatch(migration,/create_label|create_invoice|insert into apex_internal\.checkout_order_intents/);
 assert.match(cron,/0 12 \* \* \*/);
 assert.match(cron,/cron.schedule/);
 assert.match(workflow,/supplier-usps-daily-reporting.sql/);
});
