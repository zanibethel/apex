import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {centralDay,normalizeProgress,renderProgressEmail,PROJECT_PROVISIONAL_COSTS}
 from "../src/lib/owner-progress-email.mjs";
const date=new Date("2026-11-03T14:00:00Z");
const pull=(n,title,merged_at)=>({number:n,title,merged_at,
 html_url:"https://github.com/zanibethel/apex/pull/"+n});
const issue=(n,title)=>({number:n,title,state:"open",
 html_url:"https://github.com/zanibethel/apex/issues/"+n});
test("Central reporting date accounts for DST changes",()=>{
 assert.equal(centralDay(date),"2026-11-03");
 assert.equal(centralDay(new Date("2026-03-08T05:59:00Z")),"2026-03-07");
 assert.equal(centralDay(new Date("2026-03-08T06:00:00Z")),"2026-03-08");
 assert.equal(centralDay(new Date("2026-11-01T05:00:00Z")),"2026-11-01");
});
test("only recently merged PRs and real open priority issues are reported",()=>{
 const p=normalizeProgress({now:date,pulls:[
  pull(221,"Checkpoint docs","2026-11-03T12:00:00Z"),
  pull(212,"Older merge","2026-10-12T10:00:00Z"),
  {...pull(209,"Closed not merged",null)},
  {...pull(208,"Wrong host","2026-11-03T12:00:00Z"),html_url:"https://malicious.example/steal"},
 ],issues:[
  issue(220,"Apex P7 — Tech ready"),
  issue(213,"Apex P0 — Supply intake"),
  {...issue(214,"Secret leaked"),state:"closed"},
  {...issue(300,"Not real issue"),pull_request:{url:"fake"}},
 ]});
 assert.deepEqual(p.completed.map(x=>x.number),[221]);
 assert.deepEqual(p.pending.map(x=>x.number),[213,220]);
});
test("report escapes untrusted PR and issue titles, but never fabricates spending",()=>{
 const p=normalizeProgress({now:date,pulls:[
  pull(221,'<img src=x onerror=alert(1)>',"2026-11-03T12:00:00Z"),
 ],issues:[issue(213,'Apex P0 — <script>danger</script>')]});
 const mail=renderProgressEmail({now:date,progress:p});
 assert.match(mail.subject,/Nov 3, 2026|2026-11-03/);
 assert.match(mail.html,/&lt;script&gt;/);
 assert.doesNotMatch(mail.html,/<script>|<img src=x/);
 assert.match(mail.text,/NOT YET VERIFIED/);
 assert.match(mail.html,/Actual Apex expenses: Unverified/);
 assert.match(mail.text,/Vercel team billing.*shared/);
 assert.doesNotMatch(mail.text,/\$0\.00 actual|\$10\.00 billed|re_[A-Za-z0-9]/);
 assert.equal(mail.idempotencyKey,"apex-owner-weekly-progress-2026-11-03");
});
test("weekly cron uses independent protected endpoint and a single owner",()=>{
 const src=readFileSync("src/app/api/cron/weekly-owner-progress/route.ts","utf8");
 const config=JSON.parse(readFileSync("vercel.json","utf8"));
 assert.ok(config.crons.some(c=>c.path==="/api/cron/daily-supplier-reports"));
 assert.ok(config.crons.some(c=>c.path==="/api/cron/weekly-owner-progress"&&c.schedule==="0 14 * * 5"));
 assert.match(src,/process\.env\.CRON_SECRET/);
 assert.match(src,/request\.headers\.get\("authorization"\)/);
 assert.match(src,/process\.env\.APEX_OWNER_PROGRESS_EMAIL/);
 assert.match(src,/process\.env\.RESEND_REPORTS_API_KEY/);
 assert.match(src,/normalizeProgress/);
 assert.match(src,/renderProgressEmail/);
 assert.match(src,/Idempotency-Key/);
 assert.match(src,/to:\[owner\]/);
 assert.match(src,/delivered:false/);
 assert.doesNotMatch(src,/cc:|bcc:|service_role|NEXT_PUBLIC_RESEND|customer_address|purchaseLabel/);
});

test("domain and Proton expenses explicitly included, but paid amounts never invented",()=>{
 const p=normalizeProgress({now:date,pulls:[],issues:[]});
 const mail=renderProgressEmail({now:date,progress:p});
 assert.equal(PROJECT_PROVISIONAL_COSTS.length,2);
 assert.deepEqual(PROJECT_PROVISIONAL_COSTS.map(x=>x.vendor),["Vercel","Proton Mail"]);
 assert.equal(PROJECT_PROVISIONAL_COSTS[0].quotedUsd,29.99);
 assert.equal(PROJECT_PROVISIONAL_COSTS[0].purchasedLocalDate,"2026-10-29");
 assert.equal(PROJECT_PROVISIONAL_COSTS[1].quotedUsd,23.97);
 assert.equal(PROJECT_PROVISIONAL_COSTS[1].category,"recurring_monthly");
 for(const entry of PROJECT_PROVISIONAL_COSTS){
  assert.equal(entry.actualPaidUsd,null);
  assert.match(mail.text,new RegExp(entry.vendor));
  assert.match(mail.html,new RegExp(entry.vendor));
  assert.match(mail.html,new RegExp(entry.quotedUsd.toFixed(2).replace(".","\\.")));
 }
 assert.match(mail.text,/ACTUAL PAID UNVERIFIED/);
 assert.match(mail.text,/NOT YET VERIFIED/);
 assert.match(mail.html,/Actual paid: not verified/);
 assert.match(mail.text,/29.99 quoted one-time/);
 assert.match(mail.text,/23.97 estimated per month/);
 assert.doesNotMatch(mail.text,/Total confirmed expenses: \$53\.96|Amount paid: \$29\.99/);
});
