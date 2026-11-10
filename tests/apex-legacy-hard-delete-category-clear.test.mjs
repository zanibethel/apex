import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261110033000_apex_hard_delete_legacy_catalog_remove_category_rules.sql");

test("only the explicit legacy archive is permanently deleted with fail-closed preflight",()=>{
 assert.match(sql,/begin;/);
 assert.match(sql,/create temporary table apex_legacy_delete_products on commit drop as/);
 assert.match(sql,/where p\.archived_at is not null/);
 assert.match(sql,/v_products <> 63 or v_categories <> 9/);
 assert.match(sql,/Archived catalog spans multiple stores/);
 assert.match(sql,/Cannot delete a category used by active retail products/);
 assert.match(sql,/order_line_snapshots/);
 assert.match(sql,/public_media_asset_versions_v1/);
 assert.match(sql,/apex_product_tax_setting_events/);
 assert.match(sql,/Cannot hard-delete records with protected commercial/);
 assert.match(sql,/v_candidates <> 63/);
 assert.match(sql,/public\.supplier_candidate_drafts/);
 assert.match(sql,/delete from public\.products p\s+using apex_legacy_delete_products a/);
 assert.match(sql,/p\.archived_at is not null and p\.is_published=false/);
 assert.match(sql,/delete from public\.categories c\s+using apex_legacy_delete_categories a/);
 assert.match(sql,/not exists\([\s\S]*?select 1 from public\.products p[\s\S]*?p\.category_id=c\.id/);
 assert.match(sql,/if exists\(select 1 from public\.products where archived_at is not null\)/);
 assert.match(sql,/commit;/);
 assert.doesNotMatch(sql,/\btruncate\b|\bdrop\s+table\b|\bcascade\s*;/i);
});

test("category names or their history no longer restrict ordinary public browsing",()=>{
 const fun=sql.slice(sql.indexOf("create or replace function apex_internal.retail_showcase_category_allowed("));
 assert.match(fun,/where c\.id=p_category_id and c\.store_id=p_store_id/);
 assert.doesNotMatch(fun,/historical\.archived_at|c\.slug|c\.name|peptide|anabolic|steroid|research|weapon/);
 assert.match(fun,/revoke all on function apex_internal\.retail_showcase_category_allowed/);
 assert.doesNotMatch(sql,/update apex_internal\.private_release_gate|update apex_internal\.retail_showcase_gate|is_published=true|createInvoice|btcpay/);
});

test("supplier publishing still requires authorization, product checks and admin hold overrides",()=>{
 const previous=read("supabase/migrations/20261110021500_apex_retail_publishing_any_ordinary_category.sql");
 const supplier=read("src/app/api/assistant/supplier/route.ts");
 const active=read("src/app/supplier/catalog/bulk/page.tsx");
 assert.match(previous,/m\.user_id=v_actor and m\.role in \('owner','manager'\)/);
 assert.match(previous,/v_state\.admin_gate<>'clear'/);
 assert.match(previous,/private_product_review_states/);
 assert.match(previous,/supplier_candidate_drafts/);
 assert.match(previous,/i\.quantity_reserved between 0 and i\.quantity_on_hand/);
 assert.match(previous,/'can_checkout',false/);
 assert.match(previous,/\(v_product\.name\|\|' '\|\|coalesce\(v_product\.description,''\)\) ~\*/);
 assert.match(supplier,/client\.auth\.getUser\(\)/);
 assert.match(active,/get_supplier_retail_eligible_categories/);
});

test("obsolete archive admin UI and supplier archived-products messaging have been removed",()=>{
 assert.equal(existsSync("src/app/admin/catalog-archive/page.tsx"),false);
 assert.doesNotMatch(read("src/app/admin/page.tsx"),/\/admin\/catalog-archive/);
 assert.doesNotMatch(read("src/app/supplier/catalog/bulk/page.tsx"),/archive is preserved, not deleted/);
});
