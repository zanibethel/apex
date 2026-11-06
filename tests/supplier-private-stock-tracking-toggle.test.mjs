import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("saved supplier products receive a per-product tracking preference",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const editor=read("src/app/supplier/catalog/bulk-editor.tsx");
 const card=read("src/app/supplier/catalog/bulk-card-media.tsx");
 assert.match(page,/\.from\("supplier_private_stock_preferences"\)/);
 assert.match(page,/\.eq\("store_id",store\.id\)\.limit\(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT\)/);
 assert.match(page,/trackQuantities:trackByProduct\.get\(p\.id\)\?\?true/);
 assert.match(page,/trackByProduct\.get\(p\.id\)===false\?"Quantity not tracked":stock\.label/);
 assert.match(editor,/trackQuantities=\{savedMedia\.get\(r\.id\)\?\.trackQuantities\?\?true\}/);
 assert.match(card,/Track inventory quantities/);
 assert.match(card,/checked=\{tracked\}/);
 assert.match(card,/setPrivateStockPreference/);
 assert.match(card,/!tracked\?<small role="status">Quantity counts are hidden/);
 assert.match(card,/if\(!enabled\|\|pending\|\|!tracked\|\|persisted===undefined\|\|!stockTracked\)/);
 assert.match(card,/Existing inventory is preserved/);
});
test("private settings require owner/manager access and use optimistic concurrency",()=>{
 const action=read("src/app/supplier/operations/actions.ts");
 const section=action.slice(action.indexOf("export async function setPrivateStockPreference("),action.indexOf("export async function requestWalletDestination("));
 assert.match(section,/authorizedStore\(form\)/);
 assert.match(section,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(section,/\.eq\("store_id",store\.storeId\)/);
 assert.match(section,/\.eq\("is_published",false\)/);
 assert.match(section,/\.eq\("track_quantities",current\)/);
 assert.match(section,/expectedTracking/);
 assert.match(section,/\.from\("supplier_private_stock_preferences"\)/);
 assert.doesNotMatch(section,/service_role|createPublicUrl|createInvoice|payment|\.from\("inventory_items"\)|\.from\("supplier_listing_controls"\)|\.from\("apex_internal"/);
});
test("stock mode has forced tenant-scoped RLS and cannot activate public commerce",()=>{
 const sql=read("supabase/migrations/20261106185000_apex_supplier_private_stock_preferences.sql");
 const wf=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/force row level security/);
 assert.match(sql,/grant update \(track_quantities\)/);
 assert.match(sql,/p\.is_published=false and s\.is_public=false/);
 assert.match(sql,/m\.user_id=\(select auth\.uid\(\)\) and m\.role in \('owner','manager'\)/);
 assert.match(wf,/supplier-private-stock-preferences\.sql/);
 assert.doesNotMatch(sql,/create table public\.inventory_items|alter table public\.inventory_items|update public\.inventory_items|private_release_gate|createInvoice|is_published=true/);
});
test("stock-toggle only affects private editor and label, not checkout calculations",()=>{
 const page=read("src/app/supplier/catalog/bulk/page.tsx");
 const card=read("src/app/supplier/catalog/bulk-card-media.tsx");
 assert.match(page,/privateInventoryState\(quantities\.get\(p\.id\)\)/);
 assert.match(page,/get_private_release_readiness/);
 assert.match(page,/Quantity not tracked/);
 assert.match(card,/verified stock and product authorization are/);
 const css=read("src/app/supplier/catalog/bulk/mobile-layout.css");
 assert.match(css,/apex-bulk-stock-mode/);
 assert.doesNotMatch(css,/pointer-events:none/);
});
