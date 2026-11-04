import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSupplierReviewEmailStatus}
 from '../src/lib/supplier/review-email-delivery-status.mjs';
const store='62000000-0000-0000-0000-000000000001';
const day='2026-11-04';
const baseline={
 schema_version:1,store_id:store,report_day:day,
 state:'not_prepared',attempt_count:0,
 attachment_available_in_dashboard:true,transport_mode:'synthetic_only',
 real_provider_accepted:false,real_inbox_delivered:false,
 mail_sent:false,shipping_modified:false,
};
test('no report preparation does not imply a sent message',()=>{
 const parsed=parseSupplierReviewEmailStatus(baseline,store,day);
 assert.ok(parsed);
 assert.equal(parsed.state,'not_prepared');
 assert.equal(parsed.simulatedOnly,true);
 assert.equal(parsed.actualMessageSent,false);
 assert.equal(parsed.providerAcceptanceVerified,false);
 assert.equal(parsed.inboxDeliveryVerified,false);
});
test('every simulated provider outcome stays explicitly non-real',()=>{
 for(const state of ['prepared','simulated_accepted','simulated_delivered','simulated_failed']){
  const parsed=parseSupplierReviewEmailStatus({
   ...baseline,state,attempt_count:state==='simulated_failed'?2:1,
  },store,day);
  assert.ok(parsed,state);
  assert.equal(parsed.actualMessageSent,false);
  assert.equal(parsed.inboxDeliveryVerified,false);
 }
});
test('wrong supplier/day, forged delivery, extra PII and malformed receipts reject',()=>{
 for(const data of [
  {...baseline,store_id:'62000000-0000-0000-0000-000000000002'},
  {...baseline,report_day:'2026-11-03'},
  {...baseline,real_provider_accepted:true},
  {...baseline,real_inbox_delivered:true},
  {...baseline,mail_sent:true},
  {...baseline,shipping_modified:true},
  {...baseline,transport_mode:'live_resend'},
  {...baseline,attachment_available_in_dashboard:false},
  {...baseline,state:'delivered'},
  {...baseline,state:'prepared',attempt_count:0},
  {...baseline,state:'not_prepared',attempt_count:1},
  {...baseline,recipient_email:'secret@example.org'},
 ])assert.equal(parseSupplierReviewEmailStatus(data,store,day),null);
});
test('preview page is authenticated, no direct provider calls or token links',()=>{
 const src=readFileSync('src/app/supplier/reports/fulfillment/email-preview/page.tsx','utf8');
 const client=readFileSync('src/app/supplier/reports/fulfillment/email-preview/download.tsx','utf8');
 assert.match(src,/getSupplierWorkspace/);
 assert.match(src,/readCompleteReviewWorkbook/);
 assert.match(src,/get_supplier_review_email_status/);
 assert.match(src,/sandbox=""/);
 assert.match(src,/This preview has not transmitted a message/); // explicit no-send disclosure
 assert.doesNotMatch(src,/RESEND_REPORTS_API_KEY|createClient|sendEmail|purchaseLabel|decryptAddress|service_role/);
 assert.match(client,/Download metadata-only attachment preview/);
 assert.doesNotMatch(client,/fetch\(|\.rpc\(|authorization|service_role/);
});
test('existing live daily sales mail cron is unchanged by review email preview',()=>{
 const source=readFileSync('src/app/api/cron/daily-supplier-reports/route.ts','utf8');
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.ok(config.crons.some(x=>x.path==='/api/cron/daily-supplier-reports'&&x.schedule==='0 11 * * *'));
 assert.doesNotMatch(source,/review_email_manifest|review_supplier_email|supplier_review_email_manifests|review-email-report-manifest/);
});
