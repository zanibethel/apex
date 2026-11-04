import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createSupplierReviewEmailPreview,renderSupplierReviewEmailPreview,
 REVIEW_ATTACHMENT_HEADERS,
} from '../src/lib/supplier/review-email-report-manifest.mjs';
import {buildCumulativeReviewWorkbook}
 from '../src/lib/supplier/cumulative-fulfillment-review-csv.mjs';
const s='62000000-0000-0000-0000-000000000001';
const other='62000000-0000-0000-0000-000000000002';
const order=(i,day=3)=>({
 id:'66000217-0000-4000-8000-'+String(i).padStart(12,'0'),
 storeId:s,reference:'SYNTH-ORDER-'+i,
 purchasedAt:new Date(Date.UTC(2026,10,day,20,0,i)).toISOString(),
 readiness:'held',purchasedUnits:3,plannedUnits:2,unplannedUnits:1,
 lines:[{number:1,sku:'=HYPERLINK',title:'<script>unsafe',
  variant:'X',purchased:3,planned:2,unplanned:1}],
 plans:[{id:'71000217-0000-4000-8000-'+String(i).padStart(12,'0'),
  reference:'SYNTH-PLAN-'+i,revision:2,status:'review_only',
  plannedUnits:2,drafts:[{carrier:'USPS',reference:'9400000000000000'+
   String(i).padStart(4,'0'),revision:2,
   recordedAt:'2026-11-04T15:00:00.000Z'}],
  canShip:false,canBuyLabel:false}],
 canShip:false,canBuyLabel:false,canEnterTracking:false,
});
function report(items){
 const orders=[...items].sort((a,b)=>b.purchasedAt.localeCompare(a.purchasedAt));
 return buildCumulativeReviewWorkbook([{
  storeId:s,total:orders.length,limit:10,offset:0,
  hasMore:false,orders,
 }],s,'2026-11-04');
}
const r=report([order(1),order(2,4)]);
test('manifest keeps stable original-order IDs, new/carried counts and digest',()=>{
 const a=createSupplierReviewEmailPreview(r,s,'2026-11-04');
 const b=createSupplierReviewEmailPreview(r,s,'2026-11-04');
 assert.deepEqual(a,b);
 assert.equal(a.manifest.orders,2);
 assert.equal(a.manifest.newToday,1);
 assert.equal(a.manifest.carriedForward,1);
 assert.equal(a.manifest.partlyPlanned,2);
 assert.equal(a.manifest.shippedVerified,0);
 assert.equal(a.manifest.inboxDelivered,false);
 assert.equal(a.manifest.canSend,false);
 assert.match(a.manifest.digestSha256,/^[0-9a-f]{64}$/);
 assert.equal(a.manifest.attachmentBytes,Buffer.byteLength(a.csv));
 assert.equal(a.csv.split('\r\n').length,6);
 assert.equal(new Set(a.csv.split('\r\n').slice(1,5)
  .map(x=>x.split(',')[1])).size,2);
});
test('attachment includes only typed metadata, never untrusted catalog or customer data',()=>{
 const {csv,manifest}=createSupplierReviewEmailPreview(r,s,'2026-11-04');
 assert.equal(csv.split('\r\n')[0],REVIEW_ATTACHMENT_HEADERS.join(','));
 assert.doesNotMatch(csv,/HYPERLINK|script|SYNTH-ORDER|SYNTH-PLAN|940000|UPS|USPS|recipient|address|email|phone|ciphertext|review_note/i);
 assert.equal(manifest.attachmentMediaType,'text/csv');
 assert.equal(manifest.requiresAuthenticatedAccess,true);
 assert.doesNotMatch(JSON.stringify(manifest),/customer|recipient|tracking_reference|email_address|label/i);
});
test('HTML+text preview stays readable without leaking free-text source data',()=>{
 const {manifest}=createSupplierReviewEmailPreview(r,s,'2026-11-04');
 const email=renderSupplierReviewEmailPreview(manifest);
 assert.match(email.html,/name="viewport"/);
 assert.match(email.html,/max-width:560px/);
 assert.match(email.html,/New on report date/);
 assert.match(email.html,/Fully planned \(not shipped\)/);
 assert.match(email.html,/No message has been sent/);
 assert.match(email.text,/Carried forward: 1/);
 assert.match(email.text,/This does not confirm shipping or delivery/);
 assert.match(email.text,/https:\/\/apexanabolics.co\/supplier\/reports\/fulfillment/);
 assert.doesNotMatch(email.html+email.text,/SYNTH-ORDER|SYNTH-PLAN|HYPERLINK|script|recipient|customer_address|tracking_reference/i);
});
test('rejects mismatched store, date, partial, paid, future or shipped claims',()=>{
 for(const bad of [
  {...r,storeId:other},{...r,reportDay:'2026-11-05'},
  {...r,complete:false},{...r,canShip:true},
  {...r,source:'verified_payment'},
  {...r,summary:{...r.summary,shipped:1}},
  {...r,summary:{...r.summary,newToday:99}},
  {...r,rows:[...r.rows,r.rows[0]]},
  {...r,rows:[{...r.rows[0],store_id:other},...r.rows.slice(1)]},
  {...r,rows:[{...r.rows[0],planned_quantity:'99'},...r.rows.slice(1)]},
 ])assert.throws(()=>createSupplierReviewEmailPreview(bad,s,'2026-11-04'),
  /Review-only email attachment source rejected/);
 assert.throws(()=>createSupplierReviewEmailPreview(r,other,'2026-11-04'));
 const valid=createSupplierReviewEmailPreview(r,s,'2026-11-04');
 assert.throws(()=>renderSupplierReviewEmailPreview({...valid.manifest,canSend:true}));
 assert.throws(()=>renderSupplierReviewEmailPreview({...valid.manifest,shippedVerified:1}));
});
test('no email network/production dispatch or link with embedded tokens in review contract',()=>{
 const code=readFileSync('src/lib/supplier/review-email-report-manifest.mjs','utf8');
 assert.doesNotMatch(code,/fetch\(|resend\.|nodemailer|process\.env|sendEmail|createInvoice|purchaseLabel|Bearer |signedUrl|authorization:|customer_address/);
 assert.match(code,/requiresAuthenticatedAccess:true/);
});
