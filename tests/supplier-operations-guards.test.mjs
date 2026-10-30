import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("supplier catalog writes require independent server feature flag and verified membership", () => {
 const a=read("src/app/supplier/operations/actions.ts");
 assert.match(a,/APEX_DRAFT_CATALOG_WRITES_ENABLED/);
 assert.match(a,/auth.getUser\(\)/);
 assert.match(a,/email_confirmed_at/);
 assert.match(a,/supplier_memberships/);
 assert.match(a,/role.*owner.*manager/);
 assert.match(a,/eq\("is_public",false\)/);
 assert.match(a,/\.insert\(\{store_id:store.storeId/);
 assert.match(a,/\.eq\("is_published",false\)/);
 assert.match(a,/eq\("quantity_on_hand",expected\)/);
 assert.doesNotMatch(a,/service_role|auth\.admin|is_published:true|console.log/);
});

test("wallet requests only target signet and never activate a payout", () => {
 const a=read("src/app/supplier/operations/actions.ts");
 const sql=read("database/sql/apex_supplier_operations_review.sql");
 assert.match(a,/APEX_WALLET_REQUESTS_ENABLED/);
 assert.match(a,/requestWalletDestination/);
 assert.match(a,/tb1/);
 assert.match(sql,/network='signet'/);
 assert.match(sql,/request_state='pending'/);
 assert.doesNotMatch(a,/privateKey|secretKey|sendToAddress|transferBTC|submitPayout/);
});

test("sales are verified read-only and not supplied by the browser", () => {
 const sql=read("database/sql/apex_supplier_operations_review.sql");
 const page=read("src/app/supplier/reports/page.tsx");
 assert.match(sql,/supplier_sales_history/);
 assert.match(sql,/revoke all on public.supplier_sales_history/);
 assert.match(page,/supplier_sales_history/);
 assert.match(page,/No sales recorded/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.upsert\(/);
});

test("administrator split is proposed-only, authenticated and audited", () => {
 const a=read("src/app/admin/splits/actions.ts");
 const page=read("src/app/admin/splits/page.tsx");
 const sql=read("database/sql/apex_supplier_operations_review.sql");
 assert.match(a,/isVerifiedPlatformAdmin/);
 assert.match(a,/APEX_SPLIT_DRAFT_WRITES_ENABLED/);
 assert.match(a,/supplier_percent:percent/);
 assert.match(a,/store_split_drafts/);
 assert.match(page,/No live transfers/);
 assert.match(sql,/store_split_draft_audit/);
 assert.match(sql,/admin_split_draft_update/);
 assert.doesNotMatch(a,/BTCPay\.payout|prism\.pay|broadcastTransaction/);
});

test("dashboards offer operational sections with per-role isolation", () => {
 const supplier=read("src/app/supplier/page.tsx");
 const admin=read("src/app/admin/page.tsx");
 for (const link of ["/supplier/catalog","/supplier/inventory","/supplier/reports","/supplier/wallets"])
   assert.ok(supplier.includes(link), "missing supplier section "+link);
 assert.match(admin,/\/admin\/splits/);
 assert.doesNotMatch(supplier,/\/admin\/splits/);
});

test("database audit trails are append-only and RLS-protected", () => {
 const sql=read("database/sql/apex_supplier_operations_review.sql");
 assert.match(sql,/alter table public.supplier_catalog_audit enable row level security/);
 assert.match(sql,/alter table public.supplier_wallet_requests enable row level security/);
 assert.match(sql,/alter table public.store_split_drafts enable row level security/);
 assert.match(sql,/security definer set search_path=pg_catalog/);
 assert.match(sql,/revoke all on schema apex_internal/);
 assert.match(sql,/create trigger apex_inventory_audit/);
 assert.match(sql,/create trigger apex_split_draft_audit/);
});
