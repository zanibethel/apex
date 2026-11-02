import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {draftSetupSteps} from "../src/lib/catalog/draft-content-checklist.mjs";
import {listingControlAuditAction} from "../src/lib/catalog/listing-control.mjs";
const read=p=>readFileSync(p,"utf8");

test("zero inventory is valid for listing setup, not sale readiness",()=>{
 const p={name:"Synthetic preview",sku:"TEST-1",description:"Illustrative item",
 category_id:"cat",image_path:"private/image.png",price_cents:100,is_active:true};
 const complete=draftSetupSteps(p,{quantity_on_hand:0,quantity_reserved:0});
 assert.equal(complete.setupComplete,true);
 assert.equal(complete.steps.find(s=>s.id==="stock").complete,true);
 assert.equal(draftSetupSteps(p,null).setupComplete,false);
 assert.equal(draftSetupSteps(p,{quantity_on_hand:-1,quantity_reserved:0}).setupComplete,false);
 assert.equal(draftSetupSteps(p,{quantity_on_hand:0,quantity_reserved:1}).setupComplete,false);
});

test("supplier product card has an explicit pencil editor, selection and switch",()=>{
 const c=read("src/app/supplier/catalog/bulk-editor.tsx");
 const inline=read("src/app/supplier/catalog/bulk-inline-offer.tsx");
 assert.match(c,/aria-label=\{"Edit "\+\(r\.name/);
 assert.match(c,/aria-expanded=\{editOpenKeys\.includes\(r\.key\)\|\|!r\.id\}/);
 assert.match(c,/role="switch"/);
 assert.match(c,/aria-label=\{"Publish "\+\(r\.name/);
 assert.match(c,/onChange=\{e=>r\.id&&publish\(\[r\.id\],e\.target\.checked\?"publish":"unpublish"\)\}/);
 assert.match(c,/type="checkbox" disabled=\{busy\} checked=\{selectedSet\.has\(r\.key\)\}/);
 assert.match(c,/Unpublish selected/);
 assert.match(c,/Publish selected/);
 assert.match(c,/showPublishAction=\{false\}/);
 assert.match(inline,/showPublishAction&&<button/);
 assert.match(c,/Edit and resubmit for review/);
 assert.match(c,/BulkCardMedia/);
 assert.match(c,/r\.description|description/);
});

test("supplier server action enforces membership and audited RPC, supports both states",()=>{
 const a=read("src/app/supplier/catalog/bulk-actions.ts");
 assert.match(a,/saveBulkListingIntents/);
 assert.match(a,/action!=="publish"&&action!=="unpublish"/);
 assert.match(a,/verifiedStore\(storeId\)/);
 assert.match(a,/ids\.length>50/);
 assert.match(a,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(a,/\.eq\("store_id",storeId\)\.in\("id",ids\)/);
 assert.match(a,/set_supplier_listing_intent/);
 assert.match(a,/p_action:action/);
 assert.match(a,/saveBulkPublicationRequests/);
 assert.doesNotMatch(a,/is_published:\s*true|service_role|auth\.admin|createInvoice/);
});

test("owner unpublish and lock are separate, audited; lock reason is required",()=>{
 const action=read("src/app/admin/listing-controls/actions.ts");
 const form=read("src/app/admin/listing-controls/form.tsx");
 const sql=read("database/sql/apex_simple_listing_controls_REVIEW_ONLY.sql");
 assert.match(action,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(action,/\["hold","require_review","approve_republish","unpublish"\]/);
 assert.match(form,/value="unpublish"/);
 assert.match(form,/value="hold"/);
 assert.match(form,/value="require_review"/);
 assert.match(form,/value="approve_republish"/);
 assert.match(form,/name="reason"/);
 assert.match(sql,/elsif p_action='unpublish' then/);
 assert.match(sql,/supplier_wants_listing=false,reason=v_note/);
 assert.match(sql,/admin_unpublish/);
 assert.match(sql,/p_action in \('hold','require_review'\) and v_note is null/);
 assert.match(sql,/enabled=false/);
 assert.match(sql,/i\.quantity_on_hand>=0/);
 assert.doesNotMatch(sql,/update public\.products set is_published|update public\.stores set is_public|enable.*BTCPay/i);
 assert.equal(listingControlAuditAction("admin_unpublish"),"Administrator unpublished the listing");
});

test("purchase and public display remain separate gates",()=>{
 const sql=read("database/sql/apex_public_sold_out_catalog_REVIEW_ONLY.sql");
 const gate=read("src/lib/supabase/approved-sold-out-catalog.ts");
 assert.match(sql,/gate\.enabled=true/);
 assert.match(sql,/pa\.status='verified'/);
 assert.match(sql,/sa\.status='verified'/);
 assert.match(gate,/APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled"/);
});
