import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("approved public gallery defaults OFF, only calls pinned Apex read-only RPC",()=>{
 const loader=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const env=read(".env.example");
 assert.match(env,/APEX_PUBLIC_SOLD_OUT_CATALOG=off/);
 assert.match(loader,/process\.env\.APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled"/);
 assert.match(loader,/fhqpkpztercadcxspdkg\.supabase\.co/);
 assert.match(loader,/\/rest\/v1\/rpc\/get_public_sold_out_catalog/);
 assert.match(loader,/method:"GET"/);
 assert.match(loader,/cache:"no-store"/);
 assert.match(loader,/AbortSignal\.timeout\(6000\)/);
 assert.match(loader,/state:"disabled",products:\[\]/);
 assert.doesNotMatch(loader,/service_role|SUPABASE_SECRET|\.insert\(|\.update\(|\.delete\(|Bearer /);
});
test("strict product result permits ONLY approved public price, not private IDs or stock",()=>{
 const loader=read("src/lib/supabase/approved-sold-out-catalog.ts");
 assert.match(loader,/allowedKeys=\["id","name","description","price_cents","currency","availability","can_checkout"\]/);
 assert.match(loader,/Object\.keys\(row\)\.length!==allowedKeys\.length/);
 assert.match(loader,/item\.price_cents|row\.price_cents/);
 assert.match(loader,/row\.currency!=="USD"/);
 assert.match(loader,/row\.availability!=="sold_out"/);
 assert.match(loader,/row\.can_checkout!==false/);
 assert.match(loader,/Array\.isArray\(raw\)\|\|raw\.length>24/);
 assert.doesNotMatch(loader,/internal_source_cost|quantity_on_hand|inventory_items|image_path|supplier_import_candidates/);
});

test("public sold-out SQL is structurally off, enforces seller/product releases and zero real stock",()=>{
 const sql=read("database/sql/apex_public_sold_out_catalog_REVIEW_ONLY.sql");
 for(const marker of [
  "apex_internal.private_release_gate","gate.enabled=true",
  "sa.status='verified'","pa.status='verified'",
  "sa.valid_until>=current_date","pa.valid_until>=current_date",
  "lc.admin_gate='clear'","lc.supplier_wants_listing=true",
  "lc.republish_approval_required=false","lc.republish_approved=true",
  "hold.signature=apex_internal.listing_signature(p.name)",
  "p.is_published=true","s.is_public=true","cat.is_published=true",
  "p.is_active=true","inv.quantity_on_hand=0","inv.quantity_reserved=0",
  "review.status not in ('pending_review','changes_requested')",
  "revoke all on function public.get_public_sold_out_catalog()",
  "grant execute on function public.get_public_sold_out_catalog()",
  "'availability','sold_out'","'can_checkout',false",
 ])assert.ok(sql.includes(marker),marker);
 assert.match(sql,/security definer set search_path=pg_catalog/);
 assert.match(sql,/jsonb_array_length\(v\)<>0/);
 assert.doesNotMatch(sql,/\bupdate\s+public\.products|\binsert into\s+public\.products|\bcreateInvoice\b/);
});

test("only approved projection is rendered; demo is visually and commercially separate",()=>{
 const page=read("src/app/catalog/page.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 const css=read("src/app/catalog/sold-out-catalog.css");
 assert.match(page,/readApprovedSoldOutCatalog\(\)/);
 assert.match(page,/<ApprovedSoldOutShelf result=\{approved\}/);
 assert.match(page,/readPublishedCatalog\(\)/);
 assert.doesNotMatch(page,/connection\.products\.map|result\.products\.map/);
 assert.match(page,/APEX_CHECKOUT_MODE==="demo"&&<DemoCatalogShelf\/>/);
 assert.match(page,/No checkout, ordering or live inventory/);
 assert.match(shelf,/result\.state==="connected"&&result\.products\.length>0/);
 assert.match(shelf,/availability|SOLD OUT/);
 assert.match(shelf,/type="button" disabled/);
 assert.doesNotMatch(shelf,/useDemoCart|createInvoice|href="\/checkout|<s>|% OFF|sourceCost|imageUrl|createSignedUrl/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("disposable postgres tests include both gate-closed and forged approval denial",()=>{
 const workflow=read(".github/workflows/payout-rls.yml");
 const testSql=read("tests/payout-rls/public-soldout-release.sql");
 assert.match(workflow,/public-soldout-fixture\.sql/);
 assert.match(workflow,/apex_public_sold_out_catalog_REVIEW_ONLY\.sql/);
 assert.match(workflow,/public-soldout-release\.sql/);
 assert.match(testSql,/Synthetic approved sample/);
 assert.match(testSql,/Admin hold was bypassed/);
 assert.match(testSql,/Product authorization bypassed/);
 assert.match(testSql,/Expired supplier authorization bypassed/);
 assert.match(testSql,/Product with nonzero inventory shown as sold out/);
 assert.match(testSql,/Supplier publication intent bypassed/);
});
