import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");

test("private supplier card source uses authenticated, bounded, store-scoped read",()=>{
 const page=read("src/app/supplier/catalog/variant-review/page.tsx");
 assert.match(page,/getUser\(\)/);
 assert.match(page,/auth\.user\.email_confirmed_at/);
 assert.match(page,/\.in\("role",\["owner","manager"\]\)/);
 assert.match(page,/\.eq\("is_public",false\)/);
 assert.match(page,/stores\.length!==1/);
 assert.match(page,/\.from\("apex_supplier_variant_review_items"\)/);
 assert.match(page,/\.eq\("store_id",store\.id\)/);
 assert.match(page,/\.eq\("source_batch",SOURCE_BATCH\)/);
 assert.match(page,/count!==data\?\.length/);
 assert.match(page,/data\?\.some\(r=>r\.store_id!==store\.id\)/);
 assert.doesNotMatch(page,/service_role|createInvoice|reserveStock|import\.write|\.insert\(|\.update\(|\.delete\(/);
});

test("one parent renders one card; clarification rows never become priced options",()=>{
 const page=read("src/app/supplier/catalog/variant-review/page.tsx");
 assert.match(page,/groups=new Map<string,Parent>/);
 assert.match(page,/r\.review_status!=="pending_review"/);
 assert.match(page,/group\.unresolved\+\+/);
 assert.match(page,/<CompactVariantCard name=\{group\.name\}/);
 assert.match(page,/groups\.map\(group=>\{/);
 assert.match(page,/Price or option requires supplier clarification/);
 assert.match(page,/Existing products, images, stock and public listings are unchanged/);
 assert.match(page,/Checkout|Not available to order/);
});

test("migration is private SELECT-only, role-scoped, and leaves public gates alone",()=>{
 const sql=read("supabase/migrations/20261106040000_apex_private_supplier_variant_review_v1.sql");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/revoke all .* from PUBLIC,anon,authenticated/);
 assert.match(sql,/grant select .* to authenticated/);
 assert.match(sql,/sm\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/sm\.role in \('owner','manager'\)/);
 assert.doesNotMatch(sql,/grant (insert|update|delete)|createInvoice|is_published\s*=\s*true|private_release_gate\s+set|on hand/);
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(workflow,/private-supplier-variant-review\.sql/);
});

test("real workbook prices remain out of GitHub fixtures and source costs stay separate",()=>{
 const page=read("src/app/supplier/catalog/variant-review/page.tsx");
 assert.doesNotMatch(page,/internal_source_cost|supplier_wholesale_cost|source_cost_cents|compare_at_price/);
 assert.match(page,/retail_price_cents/);
 assert.match(page,/not verified[\s\S]*checkout prices/i);
 assert.match(page,/SOURCE_BATCH=SUPPLIER_OPTION_BATCH/);
});
