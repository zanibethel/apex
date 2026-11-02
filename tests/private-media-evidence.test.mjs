import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateMediaEvidenceStatus} from "../src/lib/catalog/private-media-evidence.mjs";
const read=p=>readFileSync(p,"utf8");
const store="20000000-0000-4000-8000-000000000003";
const product="40000000-0000-4000-8000-000000000099";
const submission="80000000-0000-4000-8000-000000000004";
const path=store+"/"+product+"/00000000-0000-4000-8000-000000000010.png";
const review={store_id:store,product_id:product,submission_id:submission,
 status:"approved_internal",snapshot:{image_path:path}};
const event={store_id:store,product_id:product,submission_id:submission,
 image_path:path,review_status:"evidence_recorded",
 identity_reference:"document identity",
 rights_reference:"document rights"};
test("evidence is only current for the same submission, product, and image path",()=>{
 assert.equal(privateMediaEvidenceStatus(review,event).kind,"recorded");
 assert.equal(privateMediaEvidenceStatus(review,null).kind,"unreviewed");
 assert.equal(privateMediaEvidenceStatus({...review,status:"changes_requested"},event).kind,"stale");
 assert.equal(privateMediaEvidenceStatus({...review,submission_id:"80000000-0000-4000-8000-000000000005"},event).kind,"stale");
 assert.equal(privateMediaEvidenceStatus({...review,snapshot:{image_path:path.replace("000000000010.png","000000000011.png")}},event).kind,"stale");
 assert.equal(privateMediaEvidenceStatus(review,{...event,product_id:"40000000-0000-4000-8000-000000000098"}).kind,"stale");
 assert.equal(privateMediaEvidenceStatus(review,{...event,identity_reference:""}).kind,"unavailable");
 assert.equal(privateMediaEvidenceStatus(review,{...event,review_status:"needs_correction"}).kind,"changes");
 assert.equal(privateMediaEvidenceStatus({...review,snapshot:{image_path:null}},event).kind,"missing");
});
test("admin media form and server action enforce current-image private evidence",()=>{
 const page=read("src/app/admin/media-readiness/page.tsx");
 const form=read("src/app/admin/media-readiness/form.tsx");
 const action=read("src/app/admin/media-readiness/actions.ts");
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/private_media_evidence_events/);
 assert.match(page,/evidence\.count!==evidence\.data\?\.length/);
 assert.match(page,/privateMediaEvidenceStatus\(review,event\)/);
 assert.match(page,/MediaEvidenceForm/);
 assert.match(form,/name="identityReference"/);
 assert.match(form,/name="rightsReference"/);
 assert.match(form,/name="reviewStatus"/);
 assert.match(action,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(action,/review\.submission_id!==submissionId/);
 assert.match(action,/review\.snapshot\.image_path!==imagePath/);
 assert.match(action,/review\.status!=="approved_internal"/);
 assert.match(action,/createSignedUrl\(imagePath,45\)/);
 assert.match(action,/private_media_evidence_events/);
 assert.doesNotMatch(action,/service_role|admin\.createUser|\.update\(\{is_published|createPublicUrl|createInvoice/);
});
test("evidence ledger denies public writes and any mutations to old approvals",()=>{
 const sql=read("database/sql/apex_private_media_evidence_ledger_REVIEW_ONLY.sql");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/grant select,insert on public\.private_media_evidence_events to authenticated/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/created_by=\(select auth\.uid\(\)\)/);
 assert.match(sql,/\{app_metadata,apex_role\}/);
 assert.match(sql,/r\.submission_id=private_media_evidence_events\.submission_id/);
 assert.match(sql,/r\.snapshot->>'image_path'=private_media_evidence_events\.image_path/);
 assert.match(sql,/r\.status='approved_internal'/);
 assert.doesNotMatch(sql,/create policy .+ for update|create policy .+ for delete|grant update|grant delete|enable.*checkout/i);
});
