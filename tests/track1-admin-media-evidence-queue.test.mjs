import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyAdminMediaEvidence,filterAdminMediaEvidenceQueue,
 summarizeAdminMediaEvidenceQueue,ADMIN_MEDIA_QUEUE_FILTERS}
 from "../src/lib/catalog/admin-media-evidence-queue.mjs";
const store="20000000-0000-4000-8000-000000000003";
const product="40000000-0000-4000-8000-000000000099";
const submission="80000000-0000-4000-8000-000000000004";
const path=store+"/"+product+"/00000000-0000-4000-8000-000000000010.png";
const review={
 store_id:store,product_id:product,submission_id:submission,
 status:"approved_internal",snapshot:{image_path:path},submitted_at:"2026-11-05T09:30:00Z",
};
const recorded={
 store_id:store,product_id:product,submission_id:submission,image_path:path,
 review_status:"evidence_recorded",identity_reference:"verified source document",
 rights_reference:"licensed supplier photograph",
};
const get=(r=review,e=null)=>classifyAdminMediaEvidence(r,e);
test("exact submitted-image identity and rights evidence never gives public image or order rights",()=>{
 for(const [record,event,expected] of [
  [review,null,"needs_evidence"],
  [review,recorded,"evidence_recorded"],
  [review,{...recorded,review_status:"needs_correction"},"evidence_correction"],
  [review,{...recorded,submission_id:"80000000-0000-4000-8000-000000000005"},"stale_evidence"],
  [{...review,status:"pending_review"},recorded,"review_pending"],
  [{...review,status:"changes_requested"},recorded,"changes_requested"],
  [{...review,snapshot:{image_path:null}},null,"image_problem"],
  [{...review,store_id:"untrusted"},recorded,"unavailable"],
 ]){
  const result=get(record,event);
  assert.equal(result.kind,expected);
  assert.equal(result.canDisplayPublicly,false);
  assert.equal(result.publicMediaApproved,false);
  assert.equal(result.canCreateOrder,false);
  assert.ok(Object.isFrozen(result));
 }
 assert.equal(get().adminAction,true);
 assert.equal(get(review,recorded).adminAction,false);
});
test("pending, correction, evidence and recorded queues remain distinct",()=>{
 const rows=[
  {review:{...review,product_id:"40000000-0000-4000-8000-000000000001"},
   triage:get(review,recorded)},
  {review:{...review,product_id:"40000000-0000-4000-8000-000000000002"},
   triage:get({...review,status:"changes_requested"},null)},
  {review:{...review,product_id:"40000000-0000-4000-8000-000000000003"},
   triage:get({...review,status:"pending_review"},null)},
  {review:{...review,product_id:"40000000-0000-4000-8000-000000000004"},
   triage:get(review,null)},
 ];
 const filter=id=>filterAdminMediaEvidenceQueue(rows,id);
 assert.deepEqual(ADMIN_MEDIA_QUEUE_FILTERS,[
  "action","all","pending","corrections","evidence","recorded",
 ]);
 assert.equal(filter("all").length,4);
 assert.equal(filter("action").length,2);
 assert.equal(filter("pending").length,1);
 assert.equal(filter("corrections").length,1);
 assert.equal(filter("evidence").length,1);
 assert.equal(filter("recorded").length,1);
 assert.deepEqual(filter("unknown"),[]);
 assert.deepEqual(summarizeAdminMediaEvidenceQueue(rows),{
  total:4,action:2,pending:1,corrections:1,evidence:1,
  recorded:1,publicMediaApproved:0,
 });
 assert.equal(filter("all")[0].triage.kind,"review_pending");
});
test("admin image queue signs ONLY filtered and authorized private review snapshots",()=>{
 const page=readFileSync("src/app/admin/media-readiness/page.tsx","utf8");
 const css=readFileSync("src/app/admin/media-readiness/media-readiness.css","utf8");
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/\.from\("private_product_review_states"\)/);
 assert.match(page,/\.from\("private_media_evidence_events"\)/);
 assert.match(page,/evidence\.count!==evidence\.data\?\.length/);
 assert.match(page,/classifyAdminMediaEvidence/);
 assert.match(page,/filterAdminMediaEvidenceQueue\(triaged,queue\)/);
 assert.match(page,/selectedReviews\.slice\(start,start\+BATCH\)/);
 assert.match(page,/privateProductMediaPath\(/);
 assert.match(page,/createSignedUrl\(valid\.path,90\)/);
 assert.match(page,/assessAdminMediaRelease\(review,Boolean\(preview\)\)/);
 assert.match(page,/privateMediaEvidenceStatus\(review,event\)/);
 assert.match(page,/No submissions in this queue/);
 assert.match(page,/This page cannot change records, publish assets, or enable checkout/);
 assert.match(css,/\.apex-admin-media-filters/);
 assert.doesNotMatch(page,/createPublicUrl|SUPABASE_SECRET|service_role|\.insert\(|\.update\(|\.delete\(/);
});
