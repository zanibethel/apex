import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {awaitingAdministratorCorrectionReview} from "../src/lib/catalog/listing-resubmission.mjs";
const read=p=>readFileSync(p,"utf8");

test("an admin decision resolves pending supplier correction events",()=>{
 assert.equal(awaitingAdministratorCorrectionReview(),false);
 assert.equal(awaitingAdministratorCorrectionReview([]),false);
 assert.equal(awaitingAdministratorCorrectionReview([{action:"supplier_corrections_resubmitted"}]),true);
 assert.equal(awaitingAdministratorCorrectionReview([
  {action:"publish_requested"},
  {action:"supplier_corrections_resubmitted"},
  {action:"admin_hold"},
 ]),true);
 for(const admin of ["admin_hold","admin_review_required","admin_republish_approved","admin_unpublish"]){
  assert.equal(awaitingAdministratorCorrectionReview([
   {action:admin},{action:"supplier_corrections_resubmitted"},
  ]),false);
 }
});

test("supplier resubmission requires a hosted rollout feature flag and verified private membership",()=>{
 const action=read("src/app/supplier/catalog/bulk-actions.ts");
 const sql=read("database/sql/apex_supplier_corrections_resubmit_REVIEW_ONLY.sql");
 assert.match(action,/APEX_SUPPLIER_CORRECTIONS_RESUBMIT_ENABLED/);
 assert.match(action,/resubmitSupplierCorrections/);
 assert.match(action,/verifiedStore\(storeId\)/);
 assert.match(action,/p_store_id:storeId,p_product_id:productId,p_note:raw\.trim\(\)/);
 assert.match(sql,/m\.user_id=v_actor and m\.role in \('owner','manager'\)/);
 assert.match(sql,/s\.is_public=false/);
 assert.match(sql,/p\.is_published=false/);
 assert.match(sql,/v_control\.admin_gate='clear'/);
 assert.match(sql,/supplier_corrections_resubmitted/);
 assert.match(sql,/revoke all on function public\.resubmit_supplier_listing_corrections/);
 assert.match(sql,/from public,anon/);
 assert.match(sql,/enabled=false/);
 assert.doesNotMatch(sql,/update public\.products\s+set|update public\.stores\s+set|createInvoice|is_published=true/i);
});

test("card correction flow is explicit: save first, add note, submit and keep hold",()=>{
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const admin=read("src/app/admin/listing-controls/page.tsx");
 assert.match(editor,/r\.needsSave\|\|\(correctionNotes/);
 assert.match(editor,/Resubmit saved corrections for review/);
 assert.match(editor,/What changed\? \(required for review\)/);
 assert.match(editor,/Corrections submitted · awaiting admin review/);
 assert.doesNotMatch(editor,/href=\{\"\/supplier\/catalog#details-\"\+r\.id\}/);
 assert.match(page,/awaitingAdministratorCorrectionReview/);
 assert.match(admin,/Supplier corrections awaiting review/);
});
