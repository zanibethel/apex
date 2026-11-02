import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierImageCorrectionStatus} from "../src/lib/catalog/supplier-image-correction-status.mjs";
const read=p=>readFileSync(p,"utf8");
const store="20000000-0000-4000-8000-000000000003";
const id="40000000-0000-4000-8000-000000000004";
const submission="80000000-0000-4000-8000-000000000003";
const path=store+"/"+id+"/00000000-0000-4000-8000-000000000010.png";
const product={id,store_id:store,image_path:path};
const review={store_id:store,product_id:id,submission_id:submission,status:"approved_internal",snapshot:{image_path:path}};
const feedback={store_id:store,product_id:id,submission_id:submission,image_path:path,outcome:"needs_correction",supplier_note:"Replace the inaccurate label photo."};

test("specific, current correction note appears but never counts as public approval",()=>{
 assert.deepEqual(supplierImageCorrectionStatus(product,review,feedback,true),{
  kind:"correction",label:"Image corrections needed",
  message:"Replace the inaccurate label photo.",needsAction:true});
 const accepted=supplierImageCorrectionStatus(product,review,{...feedback,outcome:"evidence_recorded",supplier_note:""},true);
 assert.equal(accepted.kind,"recorded");
 assert.match(accepted.message,/separate approval/);
});
test("stale or mismatched feedback is never presented as the current correction",()=>{
 const changedSubmission={...review,submission_id:"80000000-0000-4000-8000-000000000004"};
 assert.equal(supplierImageCorrectionStatus(product,changedSubmission,feedback).kind,"changed");
 assert.equal(supplierImageCorrectionStatus(product,review,{...feedback,store_id:"20000000-0000-4000-8000-000000000001"}).kind,"changed");
 assert.equal(supplierImageCorrectionStatus(product,review,{...feedback,product_id:"40000000-0000-4000-8000-000000000005"}).kind,"changed");
 assert.equal(supplierImageCorrectionStatus({...product,image_path:null},review,feedback).kind,"missing");
 assert.equal(supplierImageCorrectionStatus(product,{...review,snapshot:{image_path:null}},feedback).kind,"changed");
 assert.equal(supplierImageCorrectionStatus(product,review,feedback,false).kind,"unavailable");
 assert.equal(supplierImageCorrectionStatus(product,review,null).kind,"pending");
});
test("supplier bulk cards show safe image feedback and inline edit without disturbing controls",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 assert.match(page,/supplier_media_feedback_events/);
 assert.match(page,/private_product_review_states/);
 assert.match(page,/\.eq\("store_id",store\.id\)/);
 assert.match(page,/feedbackCount===imageFeedback\?\.length/);
 assert.match(page,/supplierImageCorrectionStatus/);
 assert.match(page,/imageStatusMessage:mediaStatus\.message/);
 assert.match(editor,/apex-bulk-card-top-actions/);
 assert.match(editor,/apex-bulk-card-status-row/);
 assert.match(editor,/Product image: /);
 assert.match(editor,/Edit image and product details/);
 assert.match(editor,/setEditOpenKeys/);
 assert.match(editor,/Image evidence:/);
 const admin=read("src/app/admin/media-readiness/form.tsx");
 assert.match(admin,/shared with supplier if corrections are required/);
});
test("supplier-safe projection contains no private evidence references or URLs",()=>{
 const sql=read("database/sql/apex_supplier_media_correction_feedback_REVIEW_ONLY.sql");
 const select=sql.slice(sql.indexOf("create table public.supplier_media_feedback_events("),sql.indexOf("create index supplier_media_feedback_by_store"));
 assert.doesNotMatch(select,/identity_reference|rights_reference|signed_url|public_asset/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/supplier_media_feedback_own_store_read/);
 assert.match(sql,/m\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/review_status='needs_correction' then new\.note else '' end/i);
 assert.doesNotMatch(sql,/update public\.products|update apex_internal\.private_release_gate|grant .*to anon/i);
});
