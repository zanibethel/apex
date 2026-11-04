import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSupplierDailyReportEmailPreference} from "../src/lib/supplier/daily-order-report.mjs";
const read=p=>readFileSync(p,"utf8");
const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const settings={
 schema_version:1,store_id:store,enabled:false,recipient_verified:true,
 recipient_source:"verified_account_email",
 schedule:"before_08_00_America_Chicago",
 report_type:"previous_central_calendar_day",
};
test("verified supplier report email preference fails closed on bad payload",()=>{
 assert.equal(parseSupplierDailyReportEmailPreference(settings,store).enabled,false);
 assert.equal(parseSupplierDailyReportEmailPreference({...settings,enabled:true},store).enabled,true);
 for(const v of [
  {...settings,enabled:true,recipient_verified:false},
  {...settings,extra:"another supplier"}, {...settings,store_id:"bad"},
  {...settings,recipient_source:"browser_input"},
  {...settings,schedule:"instant"}, {...settings,report_type:"all_records"},
  {...settings,enabled:"true"},{...settings,recipient_verified:0},
  {...settings,schema_version:2},
 ]){
  assert.equal(parseSupplierDailyReportEmailPreference(v,store),null);
 }
});
test("supplier report opt-in uses trusted current identity, not arbitrary destination",()=>{
 const migration=read("supabase/migrations/20261104120000_apex_supplier_daily_report_email_preferences.sql");
 const page=read("src/app/supplier/reports/daily/page.tsx");
 const action=read("src/app/supplier/reports/daily/email-actions.ts");
 assert.match(migration,/email_confirmed_at is not null/);
 assert.match(migration,/public\.supplier_memberships m/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/unique|primary key\(store_id,user_id\)/);
 assert.match(migration,/force row level security/);
 assert.match(migration,/revoke all on apex_internal\.supplier_daily_report_email_subscriptions/);
 assert.match(migration,/grant execute on function public\.set_supplier_daily_report_email_preference\(uuid,boolean\)/);
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/w\.stores\.some/);
 assert.match(action,/set_supplier_daily_report_email_preference/);
 assert.doesNotMatch(action,/form\.get\("email"\)|service_role|raw_user_meta_data/);
 assert.match(page,/Email me this daily report/);
 assert.match(page,/Enable daily emails/);
 assert.match(page,/Disable daily emails/);
 assert.match(page,/w\.user\.email/);
});
test("HTTP cron requires its secret, keeps API key server-only and deduplicates",()=>{
 const sender=read("src/app/api/cron/daily-supplier-reports/route.ts");
 const config=JSON.parse(read("vercel.json"));
 assert.deepEqual(config.crons,[{
  path:"/api/cron/daily-supplier-reports",schedule:"0 11 * * *",
 }]);
 assert.match(sender,/request\.headers\.get\("authorization"\)/);
 assert.match(sender,/process\.env\.CRON_SECRET/);
 assert.match(sender,/process\.env\.RESEND_REPORTS_API_KEY/);
 assert.match(sender,/process\.env\.APEX_REPORT_DISPATCH_TOKEN/);
 assert.match(sender,/process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
 assert.match(sender,/claim_supplier_daily_report_emails/);
 assert.match(sender,/accept_supplier_daily_report_email/);
 assert.match(sender,/Idempotency-Key/);
 assert.match(sender,/item\.dispatch_id/);
 assert.match(sender,/Apex Reports <reports@apexanabolics\.co>/);
 assert.match(sender,/to:\[item\.email\]/);
 assert.doesNotMatch(sender,/NEXT_PUBLIC_RESEND|console\.log|service_role|order_item|customer_address/);
});
test("worker only claims previous-day verified members and never activates checkout",()=>{
 const migration=read("supabase/migrations/20261104121500_apex_supplier_daily_report_worker.sql");
 const base=read("supabase/migrations/20261104120000_apex_supplier_daily_report_email_preferences.sql");
 assert.match(migration,/supplier_report_mail_worker_tokens/);
 assert.match(migration,/sha256\(convert_to\(p_token/);
 assert.match(migration,/u\.email_confirmed_at is not null/);
 assert.match(migration,/member\.user_id=sub\.user_id/);
 assert.match(migration,/r\.report_date=v_day/);
 assert.match(migration,/for update skip locked/);
 assert.match(migration,/attempt_count>=10/);
 assert.match(migration,/lease_expires_at=now\(\)\+interval '15 minutes'/);
 assert.match(migration,/provider_email_id/);
 assert.match(base,/state in \('claimed','accepted'\)/);
 assert.match(migration,/revoke all on apex_internal\.supplier_report_mail_worker_tokens/);
 assert.doesNotMatch(base+migration,/insert into apex_internal\.checkout_order_intents|can_pay.*true|create (?:order|invoice)/i);
 const existing=read("database/sql/apex_activate_supplier_daily_report_cron.sql");
 assert.match(existing,/'0 10 \* \* \*'/);
});
