import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {retailDisplayMinimum} from "../src/lib/catalog/retail-display-minimum.mjs";
const read=path=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261110032000_apex_retail_minimum_listing_fields.sql");
const ui=read("src/app/supplier/catalog/bulk/page.tsx");
const parser=read("src/lib/supabase/approved-sold-out-catalog.ts");

const basics={name:"Men's Performance T-Shirt",price_cents:2499,
 description:"A comfortable shirt for everyday wear.",is_active:true};

test("ordinary retail publish setup requires only name, positive price and description",()=>{
 assert.deepEqual(retailDisplayMinimum(basics),{ready:true,missing:[]});
 assert.deepEqual(retailDisplayMinimum({...basics,category_id:null,image_path:null,sku:"AUTO-1"}),
  {ready:true,missing:[]});
 assert.deepEqual(retailDisplayMinimum({...basics,price_cents:0}),
  {ready:false,missing:["Purchase price"]});
 assert.deepEqual(retailDisplayMinimum({...basics,name:" ",description:""}),
  {ready:false,missing:["Product name","Product description"]});
 assert.deepEqual(retailDisplayMinimum({...basics,is_active:false}),
  {ready:false,missing:["Active in private catalog"]});
 assert.ok(!read("src/lib/catalog/retail-display-minimum.mjs").includes("inventory_items"));
 assert.ok(!read("src/lib/catalog/retail-display-minimum.mjs").includes("image_path"));
 assert.ok(!read("src/lib/catalog/retail-display-minimum.mjs").includes("category_id"));
});

test("public non-checkout retail feed permits missing category and stock but not admin holds",()=>{
 assert.match(sql,/left join public\.categories c on c\.id=p\.category_id/);
 assert.match(sql,/left join public\.inventory_items i on i\.store_id=p\.store_id/);
 assert.match(sql,/where \(p\.category_id is null or/);
 assert.match(sql,/apex_internal\.retail_showcase_category_allowed\(p\.store_id,c\.id\)/);
 assert.match(sql,/when i\.quantity_on_hand>i\.quantity_reserved then 'in_stock'/);
 assert.match(sql,/else 'sold_out'/);
 assert.match(sql,/lc\.supplier_wants_listing=true and lc\.admin_gate='clear'/);
 assert.match(sql,/not lc\.republish_approval_required or lc\.republish_approved/);
 assert.match(sql,/pending_review','changes_requested/);
 assert.match(sql,/listing_identity_holds/);
 assert.match(sql,/supplier_candidate_drafts/);
 assert.match(sql,/retail_showcase_gate/);
 assert.match(sql,/'can_checkout',false/);
 assert.match(sql,/'tags',eligible\.tags/);
 assert.doesNotMatch(sql,/createInvoice|createPayment|update public\.stores set is_public/);
});

test("publish action remains authenticated, deliberate and cannot release restricted categories",()=>{
 assert.match(sql,/m\.user_id=v_actor and m\.role in \('owner','manager'\)/);
 assert.match(sql,/p_action is null or p_action not in \('publish','unpublish'\)/);
 assert.match(sql,/v_state\.admin_gate<>'clear'/);
 assert.match(sql,/v_state\.republish_approval_required and not v_state\.republish_approved/);
 assert.match(sql,/v_product\.category_id is null or/);
 assert.match(sql,/apex_internal\.retail_showcase_category_allowed\(p_store_id,v_product\.category_id\)/);
 assert.match(sql,/Only ordinary retail products are eligible for this showcase/);
 assert.match(sql,/private_product_review_snapshot/);
 assert.match(sql,/supplier_listing_events/);
 assert.match(sql,/Live retail display enabled; checkout remains unavailable/);
 assert.doesNotMatch(sql,/Create a valid inventory record before public display/);
 assert.doesNotMatch(sql,/update public\.products\s+set\s+is_published/);
});

test("supplier UI and public parser recognize uncategorized display without disabling product controls",()=>{
 assert.match(ui,/retailDisplayMinimum\(p\)/);
 assert.match(ui,/p\.category_id===null\|\|eligibleRetailCategoryIds\.has\(p\.category_id\)/);
 assert.match(ui,/retailMinimum\.ready/);
 assert.match(ui,/status\.canRequest&&!control\?\.supplier_wants_listing/);
 assert.match(parser,/row\.category_id===null&&row\.category_name===null/);
 assert.match(parser,/row\.can_checkout!==false/);
 assert.match(read("src/app/supplier/catalog/bulk-editor.tsx"),/categoryId:"",isActive:true,tagsText:""/);
 assert.match(read("src/app/api/assistant/supplier/route.ts"),/retailShowcase=product\.category_id===null/);
});
