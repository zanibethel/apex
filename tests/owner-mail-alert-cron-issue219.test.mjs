import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseOwnerMailAlertClaim,buildOwnerMailAlertEmail}
 from "../src/lib/supplier/owner-mail-alert.mjs";

const when=new Date("2026-11-05T17:00:00.000Z");
const day="2026-11-05";
const summary={
 accepted:8,predates_webhook:2,receipt_overdue:1,
 delayed:1,bounced:1,failed:0,complained:0,
 suppressed:0,alert_count:3,
};
const claimed={schema_version:1,state:"claimed",report_date:day,summary};
const parse=x=>parseOwnerMailAlertClaim(x,when);

test("no provider incidents never claim an owner email",()=>{
 for(const state of ["no_alerts","not_claimed"]){
  const value=parse({schema_version:1,state,report_date:day});
  assert.deepEqual(value,{state,day});
  assert.equal(Object.isFrozen(value),true);
 }
 assert.equal(parse({schema_version:1,state:"no_alerts",
  report_date:day,summary:{...summary}}),null);
});

test("verified incidents produce one stable, PII-free same-day Resend idempotency key",()=>{
 const claim=parse(claimed);
 assert.equal(claim.state,"claimed");
 assert.ok(Object.isFrozen(claim.summary));
 const m=buildOwnerMailAlertEmail(claim);
 assert.equal(m.idempotencyKey,"apex-owner-mail-health-"+day);
 assert.match(m.subject,/email delivery alert/);
 assert.match(m.text,/Missing signed receipts \(over 3 hours\): 1/);
 assert.match(m.text,/Bounced: 1/);
 assert.match(m.text,/Delayed: 1/);
 assert.match(m.text,/Pre-webhook accepted messages \(not alerts\): 2/);
 assert.match(m.text,/not verified inbox placement/);
 assert.match(m.html,/admin\/email-reports/);
 for(const v of [m.text,m.html]){
  assert.doesNotMatch(v,/verified@example|provider_email_id|customer_address|wallet/i);
 }
 assert.equal(m.html.includes("<script"),false);
 assert.equal(m.text.includes("Shipping labels purchased"),false);
});

test("invalid token source data, extra private fields, incorrect totals and date mismatch fail closed",()=>{
 const variants=[
  {...claimed,report_date:"2026-11-04"},
  {...claimed,state:"accepted"},
  {...claimed,token:"secret"},
  {...claimed,summary:{...summary,email:"a@example.com"}},
  {...claimed,summary:{...summary,alert_count:4}},
  {...claimed,summary:{...summary,bounced:-1}},
  {...claimed,summary:{...summary,accepted:1}},
  {...claimed,summary:{...summary,predates_webhook:9}},
  {...claimed,summary:{...summary,receipt_overdue:1.4}},
  {...claimed,summary:{...summary,alert_count:0}},
  {schema_version:2,state:"claimed",report_date:day,summary},
 ];
 for(const invalid of variants)assert.equal(parse(invalid),null);
 assert.throws(()=>buildOwnerMailAlertEmail(null),/Invalid owner mail alert/);
});

test("cron endpoint is protected, single-owner, gated on incident and explicit provider acceptance",()=>{
 const route=readFileSync("src/app/api/cron/owner-mail-alerts/route.ts","utf8");
 const config=JSON.parse(readFileSync("vercel.json","utf8"));
 assert.ok(config.crons.some(c=>c.path==="/api/cron/owner-mail-alerts"&&
  c.schedule==="15 16 * * *"));
 for(const needle of [
  /process\.env\.CRON_SECRET/,
  /request\.headers\.get\("authorization"\)/,
  /process\.env\.APEX_REPORT_DISPATCH_TOKEN/,
  /process\.env\.APEX_OWNER_PROGRESS_EMAIL/,
  /process\.env\.RESEND_REPORTS_API_KEY/,
  /claim_owner_mail_health_alert/,
  /parseOwnerMailAlertClaim/,
  /claim\.state!=="claimed"/,
  /"Idempotency-Key"/,
  /to:\[owner\]/,
  /accept_owner_mail_health_alert/,
  /delivered:false/,
 ])assert.match(route,needle);
 assert.doesNotMatch(route,/service_role|NEXT_PUBLIC_RESEND|console\.log|customer_address|shipping_address|purchaseLabel|sendToSupplier/);
});

test("private outbox persists a frozen summary and serializes retries against one report date",()=>{
 const sql=readFileSync("supabase/migrations/20261105155928_apex_owner_mail_health_alert_dispatch.sql","utf8");
 const workflow=readFileSync(".github/workflows/payout-rls.yml","utf8");
 for(const needle of [
  /force row level security/,
  /revoke all on apex_internal\.owner_mail_health_alert_outbox/,
  /assert_daily_report_worker_token/,
  /on conflict\(report_day\) do nothing/,
  /for update skip locked/,
  /state='accepted'/,
  /attempt_count>=4/,
  /interval '12 hours'/,
  /lease_expires_at=now\(\)\+interval '15 minutes'/,
  /receipt_overdue/,
  /predates_webhook/,
  /grant execute on function public\.claim_owner_mail_health_alert/,
 ])assert.match(sql,needle);
 assert.match(workflow,/owner-mail-alert-cron\.sql/);
 assert.doesNotMatch(sql,/update.*checkout_order_intents|insert into.*orders|customer_address|shipping_address|wallet_address/);
});
