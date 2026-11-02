import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateSourceDraftDescription} from "../src/lib/catalog/private-source-draft-description.mjs";
import {sourceReviewSummary} from "../src/lib/catalog/bulk-source-review.mjs";
const read=p=>readFileSync(p,"utf8");

test("bulk workspace imports original source records directly without a review gate",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const panel=read("src/app/supplier/catalog/source-draft-import.tsx");
 assert.match(page,/supplier_import_candidates/);
 assert.match(page,/sourceCount===sources\?\.length/);
 assert.match(page,/linkedSources\.has\(s\.id\)/);
 assert.match(page,/<SourceDraftImport /);
 assert.match(panel,/Create \$\{chosen\.length\} private cards/);
 assert.match(panel,/offset<original\.length;offset\+=10/);
 assert.match(panel,/router\.refresh\(\)/);
 assert.match(panel,/Private.*records|private.*cards/);
});

test("server-side source preparation requires supplier membership and source readback",()=>{
 const src=read("src/app/supplier/catalog/source-draft-actions.ts");
 const sql=read("database/sql/apex_private_source_one_click_drafts_REVIEW_ONLY.sql");
 assert.match(src,/APEX_PRIVATE_SOURCE_DRAFTS_ENABLED/);
 assert.match(src,/getSupplierWorkspace\(\)/);
 assert.match(src,/\["owner","manager"\]\.includes\(m\.role\)/);
 assert.match(src,/supplier_candidate_drafts/);
 assert.match(src,/sources\.data\?\.length!==ids\.length/);
 assert.match(src,/create_private_draft_from_source/);
 assert.match(src,/p_expected_cost_cents:plan\.prices\.sourceCostCents/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/for update/);
 assert.match(sql,/m\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/p\.is_published=false/);
 assert.match(sql,/v_source\.wholesale_cost_cents<>p_expected_cost_cents/);
 assert.match(sql,/inventory_items\(store_id,product_id,quantity_on_hand\)/);
 assert.match(sql,/values\(p_store_id,v_product_id,0\)/);
 assert.match(sql,/v_source\.wholesale_cost_cents,'USD',false/);
 assert.match(sql,/from public,anon/);
 assert.doesNotMatch(sql,/update public\.supplier_import_candidates set|update public\.stores set|update apex_internal\.private_release_gate set|create_invoice/i);
});

test("source mapping policy no longer equates draft existence with verified source",()=>{
 const sql=read("database/sql/apex_private_source_one_click_drafts_REVIEW_ONLY.sql");
 assert.match(sql,/supplier_candidate_drafts\.candidate_id/);
 assert.match(sql,/supplier_candidate_drafts\.store_id/);
 assert.doesNotMatch(sql,/and c\.review_status\s*=\s*'approved_for_draft'/i);
 const release=read("src/lib/catalog/private-release-decision.mjs");
 assert.match(release,/product_authorization_unverified/);
 assert.match(release,/public_release_disabled/);
});

test("unknown supplier variant gets a neutral editable private description, not fabricated claims",()=>{
 const known=privateSourceDraftDescription("BPC-157","10 MG");
 assert.match(known,/Supplier-listed variant/);
 const unknown=privateSourceDraftDescription("Synthetic sample name","5 MG");
 assert.match(unknown,/not been independently verified/);
 assert.match(unknown,/private preparation record/);
 assert.doesNotMatch(unknown,/treats|heals|proven/i);
 assert.equal(privateSourceDraftDescription("","5 MG"),null);
 assert.equal(privateSourceDraftDescription("Sample",""),null);
});

test("after draft creation, source status can still be verified; card does not count as approval",()=>{
 const source={id:"11111111-1111-4111-8111-111111111111",
  source_index:0,product_name:"BPC-157",strength:"10 MG",
  wholesale_cost_cents:1201,review_status:"unverified"};
 const linked=sourceReviewSummary(source,true);
 assert.equal(linked?.linked,true);
 assert.equal(linked?.status,"unverified");
 assert.equal(linked?.validForDraft,false);
 assert.equal(linked?.validForSourceReview,true);
 const actions=read("src/app/supplier/imports/bulk-review/actions.ts");
 const panel=read("src/app/supplier/imports/bulk-review/bulk-review-panel.tsx");
 assert.match(actions,/!summary\.validForSourceReview/);
 assert.doesNotMatch(actions,/summary\.linked\|\|summary\.status/);
 assert.match(panel,/r\.validForSourceReview/);
 assert.doesNotMatch(panel,/const disabled=r\.linked\|\|/);
 assert.match(panel,/Saved · /);
});
