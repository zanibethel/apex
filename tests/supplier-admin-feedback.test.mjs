import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {supplierAdminFeedback} from "../src/lib/catalog/supplier-admin-feedback.mjs";

const page=readFileSync("src/app/supplier/catalog/bulk/page.tsx","utf8");
const editor=readFileSync("src/app/supplier/catalog/bulk-editor.tsx","utf8");
const form=readFileSync("src/app/admin/listing-controls/form.tsx","utf8");
const actions=readFileSync("src/app/admin/listing-controls/actions.ts","utf8");
const css=readFileSync("src/app/globals.css","utf8");

test("supplier receives only current admin hold or review feedback, never ordinary notes",()=>{
 assert.equal(supplierAdminFeedback({kind:"private",reason:"Internal memo"}),null);
 assert.equal(supplierAdminFeedback({kind:"requested",reason:"Old approval note"}),null);
 assert.equal(supplierAdminFeedback({kind:"unavailable",reason:"Ignore"}),null);
 assert.equal(supplierAdminFeedback(undefined),null);
 assert.equal(supplierAdminFeedback({kind:"unsaved",reason:"Ignore"}),null);
 const hold=supplierAdminFeedback({kind:"hold",reason:"  Please correct product image.  "});
 assert.deepEqual(hold,{kind:"hold",heading:"Hold reason",message:"Please correct product image.",hasNote:true});
 const review=supplierAdminFeedback({kind:"review",reason:"Review description"});
 assert.equal(review.heading,"Review required");
 assert.equal(review.message,"Review description");
});
test("missing hold reason falls back without falsely indicating approval",()=>{
 const hold=supplierAdminFeedback({kind:"hold",reason:"   "});
 assert.equal(hold.hasNote,false);
 assert.match(hold.message,/Contact your platform administrator/);
 assert.equal(supplierAdminFeedback({kind:"review"}).hasNote,false);
 const long=supplierAdminFeedback({kind:"hold",reason:"x".repeat(1500)});
 assert.equal(long.message.length,1000);
});
test("source remains owner/manager scoped, with admin gates controlling reason disclosure",()=>{
 assert.match(page,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(page,/\.eq\("store_id",store\.id\)\.limit\(250\)/);
 assert.match(page,/republish_approved,reason/);
 assert.match(page,/reason:!listingError&&\["hold","review"\]\.includes\(status\.kind\)/);
 assert.match(editor,/supplierAdminFeedback\(listingStatus\)/);
 assert.match(editor,/adminFeedback&&<p className="apex-bulk-admin-feedback"/);
 assert.match(editor,/Administrator feedback/);
 assert.doesNotMatch(editor+page,/createPublicUrl|service_role|is_published:true|is_public:true/);
});
test("admin input makes supplier visibility explicit and refreshes the correct page",()=>{
 assert.match(form,/Reason for supplier/);
 assert.match(form,/This note is visible to the supplier/);
 assert.match(form,/Avoid confidential internal notes/);
 assert.match(actions,/action!=="approve_republish"&&!note\.trim\(\)/);
 assert.match(actions,/isVerifiedPlatformAdmin/);
 assert.match(actions,/set_admin_listing_override/);
 assert.match(actions,/revalidatePath\("\/supplier\/catalog\/bulk"\)/);
 assert.match(css,/\.apex-bulk-admin-feedback/);
});
