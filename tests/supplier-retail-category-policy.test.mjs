import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261110021500_apex_retail_publishing_any_ordinary_category.sql");

test("retail showcase no longer requires Sample Apparel or Sample Accessories",()=>{
 assert.match(sql,/create or replace function apex_internal\.retail_showcase_category_allowed/);
 assert.match(sql,/create or replace function public\.get_supplier_retail_eligible_categories/);
 assert.doesNotMatch(sql,/slug in \('sample-apparel','sample-accessories'\)/);
 assert.doesNotMatch(sql,/v_category in \('sample-apparel','sample-accessories'\)/);
 assert.match(sql,/v_retail:=apex_internal\.retail_showcase_category_allowed\(p_store_id,v_product\.category_id\)/);
 assert.match(sql,/where apex_internal\.retail_showcase_category_allowed\(p.store_id,c.id\)/);
 assert.match(sql,/revoke all on function apex_internal\.retail_showcase_category_allowed/);
 assert.match(sql,/grant execute on function public\.get_supplier_retail_eligible_categories\(uuid\)\s+to authenticated/);
 assert.match(sql,/m\.user_id=\(select auth\.uid\(\)\) and m\.role in \('owner','manager'\)/);
});

test("old archived categories and regulated category words remain excluded",()=>{
 assert.match(sql,/historical\.archived_at is not null/);
 assert.match(sql,/historical\.category_id=c.id/);
 assert.match(sql,/c\.slug\|\|' '\|\|c\.name/);
 for(const phrase of ["peptide","anabolic","steroid","hormon","research","prescription","nicotine","cannabis","weapon"]){
  assert.ok(sql.includes(phrase),phrase+" remains excluded from category eligibility");
 }
 assert.match(sql,/v_state\.admin_gate<>'clear'/);
 assert.match(sql,/not exists\(select 1 from public\.private_product_review_states/);
 assert.match(sql,/not exists\(select 1 from apex_internal\.listing_identity_holds/);
 assert.match(sql,/p\.archived_at is null and p\.is_published=false and p\.is_active=true/);
 assert.match(sql,/'can_checkout',false/);
 assert.doesNotMatch(sql,/update public\.products\s+set\s+is_published|update apex_internal\.private_release_gate|createInvoice|purchaseLabel/);
});

test("supplier manager and chat use server-owned eligibility instead of category labels",()=>{
 const manager=read("src/app/supplier/catalog/bulk/page.tsx");
 const chat=read("src/app/api/assistant/supplier/route.ts");
 assert.match(manager,/client\.rpc\("get_supplier_retail_eligible_categories",\{p_store_id:store\.id\}\)/);
 assert.match(manager,/retailAllowedError/);
 assert.match(manager,/!Array\.isArray\(retailAllowed\)/);
 assert.match(manager,/p\.category_id===null\|\|eligibleRetailCategoryIds\.has\(p\.category_id\)/);
 const minimum=read("supabase/migrations/20261110032000_apex_retail_minimum_listing_fields.sql");
 assert.match(minimum,/apex_internal\.retail_showcase_category_allowed\(p\.store_id,c\.id\)/);
 assert.match(minimum,/v_product\.category_id is null or/);
 assert.doesNotMatch(manager,/neutralCategoryIds|c\.slug==="sample-apparel"/);
 assert.match(chat,/client\.rpc\("get_supplier_retail_eligible_categories"/);
 assert.match(chat,/retailAllowedError/);
 assert.match(chat,/retailAllowed\.includes\(product\.category_id\)/);
 assert.match(chat,/const retailCategories=new Set\(retailAllowed\)/);
 assert.doesNotMatch(chat,/retailCategory\?\.slug==="sample-apparel"/);
 const help=read("src/lib/chat/supplier-catalog.mjs");
 assert.match(help,/Eligible ordinary retail items appear on the public showcase/);
});
