import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {quoteDiscount} from "../src/lib/commerce/discount-quote.mjs";

const base={is_active:true,discount_kind:"percentage",discount_value:10,
 min_subtotal_cents:0,starts_at:null,ends_at:null,usage_limit:null,redemption_count:0};
test("percentage and fixed dollar discounts use integer cents and prevent negatives",()=>{
 assert.deepEqual(quoteDiscount(base,1055),{eligible:true,discountCents:106,totalCents:949,reason:""});
 const fixed=quoteDiscount({...base,discount_kind:"fixed",discount_value:5000},1200);
 assert.equal(fixed.discountCents,1200);assert.equal(fixed.totalCents,0);
 const empty=quoteDiscount(base,0);assert.equal(empty.totalCents,0);
 assert.equal(quoteDiscount(base,-1).eligible,false);
});
test("inactive, not-started, expired, min subtotal, max uses reject",()=>{
 const now=new Date("2026-10-30T17:00:00.000Z");
 assert.equal(quoteDiscount({...base,is_active:false},1000,now).eligible,false);
 assert.equal(quoteDiscount({...base,starts_at:"2026-11-01T00:00:00.000Z"},1000,now).eligible,false);
 assert.equal(quoteDiscount({...base,ends_at:"2026-10-30T17:00:00.000Z"},1000,now).eligible,false);
 assert.equal(quoteDiscount({...base,min_subtotal_cents:2000},1000,now).eligible,false);
 assert.equal(quoteDiscount({...base,usage_limit:2,redemption_count:2},1000,now).eligible,false);
 assert.equal(quoteDiscount({...base,discount_kind:"percentage",discount_value:96},1000,now).eligible,false);
});
test("product editor separates active merchandising from publishing and validates compare-at",()=>{
 const sql=readFileSync("database/sql/apex_product_media_promos_review.sql","utf8");
 const actions=readFileSync("src/app/supplier/operations/actions.ts","utf8");
 assert.match(sql,/add column is_active boolean not null default false/);
 assert.match(sql,/compare_at_price_cents > price_cents/);
 assert.match(sql,/add column image_path text/);
 assert.match(actions,/compare_at_price_cents/);
 assert.match(actions,/is_active/);
 assert.match(actions,/eq\("is_published",false\)/);
 assert.doesNotMatch(actions,/is_published:true/);
});
test("signed image flow checks private store membership, valid types and object ownership",()=>{
 const action=readFileSync("src/app/supplier/catalog/image-actions.ts","utf8");
 const storage=readFileSync("database/sql/apex_private_product_images_storage.sql","utf8");
 assert.match(action,/getSupplierWorkspace/);
 assert.match(action,/eq\("is_published",false\)/);
 assert.match(action,/createSignedUploadUrl/);
 assert.match(action,/upload could not be verified|Image upload could not be verified/);
 assert.match(action,/upsert:false|image_path:path/);
 assert.match(storage,/public=false/);
 assert.match(storage,/storage\.objects/);
 assert.match(storage,/m\.role in \('owner','manager'\)/);
 assert.doesNotMatch(storage,/for delete|for update/i);
});
test("discounts are supplier-only, with audit and no checkout writes",()=>{
 const sql=readFileSync("database/sql/apex_product_media_promos_review.sql","utf8");
 const actions=readFileSync("src/app/supplier/discounts/actions.ts","utf8");
 assert.match(sql,/supplier_discount_codes enable row level security/);
 assert.match(sql,/supplier_discount_audit/);
 assert.match(sql,/grant update \(discount_kind,discount_value/);
 assert.doesNotMatch(sql,/grant update \(.*redemption_count/i);
 assert.match(actions,/getSupplierWorkspace/);
 assert.match(actions,/quoteDiscount/);
 assert.match(actions,/APEX_DRAFT_PROMOS_ENABLED/);
 assert.doesNotMatch(actions,/service_role|auth\.admin|payment_intent|executePayout/);
});
