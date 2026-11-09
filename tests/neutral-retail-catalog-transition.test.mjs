import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261109233000_apex_archive_legacy_and_seed_neutral_retail_v1.sql");
const fixtureSKUs=["DEMO-TEE-001","DEMO-CAP-001","DEMO-TOTE-001","DEMO-BOTTLE-001","DEMO-STICKERS-001"];
const paths=[
 "src/app/supplier/catalog/bulk/page.tsx",
 "src/app/supplier/catalog/storefront-test/page.tsx",
 "src/app/admin/storefront-preview/page.tsx",
 "src/app/api/assistant/supplier/route.ts",
 "src/app/supplier/catalog/page.tsx",
 "src/app/supplier/catalog/preview/[productId]/page.tsx",
 "src/app/supplier/catalog/bulk/preview/page.tsx",
 "src/app/supplier/catalog/bulk-actions.ts",
 "src/app/supplier/operations/actions.ts",
];
test("neutral retail transition archives exactly the original snapshot, never deletes products",()=>{
 assert.match(migration,/slug='apex-shared-store-draft'/);
 assert.match(migration,/matched_count<>63/);
 assert.match(migration,/p\.created_at<'2026-11-03T00:00:00Z'/);
 assert.match(migration,/p\.store_id=legacy_store and p\.is_published=false/);
 assert.match(migration,/set archived_at=now\(\)/);
 assert.doesNotMatch(migration,/'[0-9a-f]{8}-[0-9a-f-]{27}'::uuid/);
 assert.match(migration,/check \(archived_at is null or is_published = false\)/);
 assert.match(migration,/begin;[\s\S]*commit;/);
 assert.doesNotMatch(migration,/\bdelete\s+from\s+public\.products\b|\btruncate\s+\b|\bdrop\s+table\b/i);
});

test("five ordinary private retail sample products are seeded at zero inventory without public release",()=>{
 for(const sku of fixtureSKUs) assert.match(migration,new RegExp(sku));
 assert.match(migration,/sample-apparel/);
 assert.match(migration,/sample-accessories/);
 assert.match(migration,/on conflict\(store_id,sku\) do nothing/);
 assert.match(migration,/insert into public\.inventory_items\(store_id,product_id,quantity_on_hand,quantity_reserved\)/);
 assert.match(migration,/select p\.store_id,p\.id,0,0/);
 assert.match(migration,/sample\.price_cents,'USD',true,false/);
 assert.match(migration,/no physical sale/i);
 assert.doesNotMatch(migration,/createInvoice|test-wallet|wallet_address/);
});

test("every active supplier catalog/editor/chat route excludes the archived snapshot",()=>{
 for(const path of paths)assert.match(read(path),/\.is\("archived_at",null\)/,path);
 const operations=read("src/app/supplier/operations/actions.ts");
 assert.match(operations,/\.eq\("is_published",false\)\.is\("archived_at",null\)/);
 assert.match(operations,/\.eq\("is_published", false\)\.is\("archived_at",null\)/);
 const bulk=read("src/app/supplier/catalog/bulk/page.tsx");
 assert.match(bulk,/records have been archived for reference/);
});

test("archive remains a private read-only admin capability",()=>{
 const archive=read("src/app/admin/catalog-archive/page.tsx");
 const home=read("src/app/admin/page.tsx");
 assert.match(archive,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(archive,/\.not\("archived_at","is",null\)/);
 assert.match(archive,/count===null\|\|!products\|\|products\.length!==count/);
 assert.match(archive,/This view cannot publish, sell, edit or restore products/);
 assert.match(home,/\/admin\/catalog-archive/);
 assert.doesNotMatch(archive,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|service_role|SUPABASE_SECRET|createInvoice/);
});
