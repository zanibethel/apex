import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseProductTags} from "../src/lib/catalog/product-tags.mjs";
import {parseProductCsv,PRODUCT_CSV_HEADERS} from "../src/lib/catalog/product-csv.mjs";
import {validateSupplierChatCsv} from "../src/lib/chat/supplier-csv.mjs";
import {proposeSupplierTags} from "../src/lib/chat/supplier-tags.mjs";
import {answerSupplierCatalogMessage} from "../src/lib/chat/supplier-catalog.mjs";
import {answerApexEmbed} from "../src/lib/chat/apex-chat.mjs";
const read=path=>readFileSync(path,"utf8");
const id="11111111-1111-4111-8111-111111111111";
const retail={
 id,name:"Men's Performance T-Shirt",sku:"QA-TEE-001",
 description:"Soft athletic cotton shirt for regular gym sessions.",
 tags:["working out","gym wear","get buff","men's fitness"],
 priceCents:2499,currency:"USD",availability:"in_stock",active:true,
 requested:false,published:false,stockOnHand:5,productUpdatedAt:"2026-11-09T22:00:00.000Z",
 controlChangedAt:null,categoryName:"Sample Apparel"
};
test("tag parser bounds, normalizes and deduplicates phrases",()=>{
 assert.deepEqual(parseProductTags("Working Out|gym wear|working out|Men's Fitness").tags,
  ["working out","gym wear","men's fitness"]);
 assert.deepEqual(parseProductTags("").tags,[]);
 assert.equal(parseProductTags(Array.from({length:13},(_,i)=>"tag "+i)).ok,false);
 assert.equal(parseProductTags("x".repeat(41)).ok,false);
 assert.equal(parseProductTags("=HYPERLINK(A1)").ok,false);
 assert.equal(parseProductTags("@pay me").ok,false);
});
test("old nine-column supplier CSV works; new optional tag column stages validated tags",()=>{
 const legacy="product_id,sku,title,description,source_cost,price,compare_at_price,category,active\n"+
  ",QA-CAP-900,Sample Cap,Ordinary clothing,2.00,12.00,,Sample Apparel,true\n";
 assert.deepEqual(parseProductCsv(legacy).errors,[]);
 assert.ok(PRODUCT_CSV_HEADERS.includes("tags"));
 const tagged="product_id,sku,title,description,source_cost,price,compare_at_price,category,active,tags\n"+
  ",QA-TEE-991,Test Workout Shirt,Ordinary shirt,5.00,24.99,,Sample Apparel,true,working out|gym wear|get buff\n";
 const categories=[{id:"22222222-2222-4222-8222-222222222222",name:"Sample Apparel"}];
 const checked=validateSupplierChatCsv(tagged,categories);
 assert.equal(checked.ok,true);
 assert.deepEqual(checked.rows[0].tags,["working out","gym wear","get buff"]);
 assert.equal(validateSupplierChatCsv(tagged.replace("working out|gym wear|get buff","=cmd"),categories).ok,false);
});
test("private supplier tag edits only propose one exact product and never perform writes",()=>{
 const rows=[retail];
 const replace=proposeSupplierTags("set tags for QA-TEE-001 to working out|weight room",rows);
 assert.equal(replace.items[0].action,"edit_tags");
 assert.deepEqual(replace.items[0].tagTarget,["working out","weight room"]);
 const add=proposeSupplierTags("add tag fitness clothing to QA-TEE-001",rows);
 assert.ok(add.items[0].tagTarget.includes("fitness clothing"));
 const remove=proposeSupplierTags("remove tag get buff from QA-TEE-001",rows);
 assert.ok(!remove.items[0].tagTarget.includes("get buff"));
 const clear=proposeSupplierTags("clear tags for QA-TEE-001",rows);
 assert.deepEqual(clear.items[0].tagTarget,[]);
 assert.equal(proposeSupplierTags("add tag red to missing",rows).items.length,0);
 assert.equal(proposeSupplierTags("add tag red to QA-TEE-001",rows.concat({...retail,id:"22222222-2222-4222-8222-222222222222"})).items.length,0);
 assert.doesNotMatch(read("src/lib/chat/supplier-tags.mjs"),/\.update\(|\.insert\(|createInvoice/);
});
test("customers find workout shirts through tags and descriptions, with safe budget and availability filters",()=>{
 const cap={...retail,id:"33333333-3333-4333-8333-333333333333",name:"Commuter Cap",description:"Simple cotton cap",tags:["casual"],priceCents:999,availability:"sold_out"};
 const found=answerApexEmbed("Do you have any men's t-shirts related to working out?",[cap,retail],"connected");
 assert.equal(found.items.length,1);
 assert.equal(found.items[0].name,retail.name);
 assert.equal(answerApexEmbed("get buff shirt",[retail,cap],"connected").items.length,1);
 assert.equal(answerApexEmbed("show workout t-shirts under $30",[retail,cap],"connected").items.length,1);
 assert.equal(answerApexEmbed("workout t-shirts under $20",[retail,cap],"connected").items.length,0);
 assert.equal(answerApexEmbed("show items in stock",[cap,retail],"connected").items.length,1);
 assert.equal(answerApexEmbed("show workout t-shirts",[retail],"disabled").items.length,0);
 assert.equal(answerApexEmbed("mystery mystery",[retail],"connected").items.length,0);
});
test("public tags projection remains strictly authorized and private-safe",()=>{
 const sql=read("supabase/migrations/20261110024500_apex_public_product_tags_v1.sql");
 const route=read("src/app/api/assistant/route.ts");
 const parser=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const supplierRoute=read("src/app/api/assistant/supplier/route.ts");
 assert.match(sql,/alter table public\.products add column if not exists tags/);
 assert.match(sql,/apex_product_tags_bounded_v1/);
 assert.match(sql,/'tags',eligible\.tags/);
 assert.match(sql,/retail_showcase_gate/);
 assert.match(sql,/retail_showcase_category_allowed/);
 assert.match(sql,/lc\.supplier_wants_listing=true and lc\.admin_gate='clear'/);
 assert.match(sql,/listing_identity_holds/);
 assert.match(sql,/'can_checkout',false/);
 assert.doesNotMatch(sql,/createInvoice|update public\.stores set is_public|update public\.products set is_published/);
 assert.match(parser,/hasTags/);
 assert.match(route,/tags:p\.tags/);
 assert.match(supplierRoute,/operation==="confirm_tags"/);
 assert.match(supplierRoute,/originAllowed\(request\)/);
 assert.match(supplierRoute,/expectedProductUpdatedAt/);
 assert.match(supplierRoute,/\.eq\("updated_at",edit\.expectedProductUpdatedAt\)/);
 assert.doesNotMatch(supplierRoute,/service_role|SUPABASE_SECRET/);
});

test("supplier can summarize and locate incomplete catalog records using private data only",()=>{
 const inactive={...retail,id:"44444444-4444-4444-8444-444444444444",name:"Test Inactive Hoodie",
  sku:"QA-HOOD-100",active:false,tags:[],availableStock:0};
 const summary=answerSupplierCatalogMessage("how many products are in my catalog?",[retail,inactive]);
 assert.match(summary.answer,/2 saved products/);
 assert.match(summary.answer,/1 inactive/);
 assert.match(summary.answer,/1 without discovery tags/);
 const filtered=answerSupplierCatalogMessage("show inactive products",[retail,inactive]);
 assert.equal(filtered.items.length,1);
 assert.equal(filtered.items[0].name,inactive.name);
 const untagged=answerSupplierCatalogMessage("show products without tags",[retail,inactive]);
 assert.equal(untagged.items.length,1);
 assert.equal(untagged.items[0].name,inactive.name);
});
