import {centralDay} from "../owner-progress-email.mjs";

// Versioned immutable claimed payload from the token-guarded SQL outbox.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const SUM_FIELDS=[
 "accepted","predates_webhook","receipt_overdue","delayed","bounced",
 "failed","complained","suppressed","alert_count",
];
const keysEqual=(a,fields)=>Object.keys(a).sort().join(",")===
 fields.slice().sort().join(",");
const n=v=>Number.isSafeInteger(v)&&v>=0;
export function parseOwnerMailAlertClaim(input,when=new Date()){
 const day=centralDay(when);
 if(!input||typeof input!=="object"||Array.isArray(input)||
  input.schema_version!==1||!DAY.test(input.report_date)||
  input.report_date!==day)return null;
 if(["no_alerts","not_claimed"].includes(input.state)){
  return keysEqual(input,["schema_version","state","report_date"])?
   Object.freeze({state:input.state,day}):null;
 }
 if(input.state!=="claimed"||
  !keysEqual(input,["schema_version","state","report_date","summary"])||
  !input.summary||typeof input.summary!=="object"||
  Array.isArray(input.summary)||!keysEqual(input.summary,SUM_FIELDS)||
  !SUM_FIELDS.every(f=>n(input.summary[f])))return null;
 const x=input.summary;
 if(x.alert_count===0||x.alert_count>x.accepted||
  x.predates_webhook>x.accepted||
  x.alert_count!==x.receipt_overdue+x.delayed+x.bounced+
   x.failed+x.complained+x.suppressed)return null;
 return Object.freeze({
  state:"claimed",day,
  summary:Object.freeze({...x}),
 });
}
export function buildOwnerMailAlertEmail(claim){
 if(!claim||claim.state!=="claimed"||!DAY.test(claim.day)||
  !claim.summary||claim.summary.alert_count<1)
  throw Error("Invalid owner mail alert");
 const x=claim.summary;
 const lines=[
  ["Missing signed receipts (over 3 hours)",x.receipt_overdue],
  ["Bounced",x.bounced],
  ["Failed",x.failed],
  ["Delayed",x.delayed],
  ["Complaints",x.complained],
  ["Suppressed",x.suppressed],
 ];
 const text=[
  "APEX — Supplier report email delivery alert",
  "Report day: "+claim.day+" (America/Chicago)",
  "Actionable report-delivery signals: "+x.alert_count,
  ...lines.map(([label,count])=>label+": "+count),
  "Provider accepted in seven-day window: "+x.accepted,
  "Pre-webhook accepted messages (not alerts): "+x.predates_webhook,
  "",
  "Signed provider events report mail-server transport, not verified inbox placement.",
  "Review the protected admin dashboard before retrying any message.",
  "https://apexanabolics.co/admin/email-reports",
  "This notification does not grant order, payment, fulfillment or shipping rights.",
 ].join("\n");
 const rows=lines.map(([label,count])=>
  '<tr><td style="padding:9px;border-bottom:1px solid #504151;color:#ddd1da">'+
  label+'</td><td align="right" style="padding:9px;border-bottom:1px solid #504151;color:#fff">'+
  count+"</td></tr>").join("");
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="background:#0e1014;color:#f5f2f5;font:14px Arial,sans-serif;padding:22px">'+
  '<main style="max-width:590px;margin:auto;padding:24px;background:#201b22;border:1px solid #6d4351;border-radius:12px">'+
  '<div style="font-weight:700;letter-spacing:2px;color:#f1b6c5">APEX ANABOLICS</div>'+
  '<h1 style="font-size:23px;color:#fff">Email delivery needs review</h1>'+
  '<p>Report day: '+claim.day+' · Central Time</p>'+
  '<p><strong>'+x.alert_count+'</strong> report delivery signal(s) need attention.</p>'+
  '<table role="presentation" style="width:100%;border-collapse:collapse">'+rows+'</table>'+
  '<p>Provider accepted: '+x.accepted+' · Pre-webhook: '+x.predates_webhook+'</p>'+
  '<p>Transport status is not proof of inbox placement. Confirm subscriptions and provider status before retrying.</p>'+
  '<p><a style="color:#ffc6d6" href="https://apexanabolics.co/admin/email-reports">Open protected email health dashboard</a></p>'+
  '<p style="font-size:12px;color:#c3b1bb">No orders, recipients or customer data are included.</p>'+
  '</main></body></html>';
 return Object.freeze({
  subject:"Apex supplier email delivery alert — "+claim.day,
  idempotencyKey:"apex-owner-mail-health-"+claim.day,
  alertCount:x.alert_count,
  text,html,
 });
}
