import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261110123000_apex_admin_offline_product_reviews.sql");
const page=read("src/app/admin/catalog-release/page.tsx");
const action=read("src/app/admin/catalog-release/offline-review-actions.ts");
const form=read("src/app/admin/catalog-release/offline-review-form.tsx");

test("admin offline reviews have authenticated and auditable private storage",()=>{
 for(const token of [
  "create table if not exists apex_internal.admin_offline_product_reviews",
  "create table if not exists apex_internal.admin_offline_product_review_events",
  "enable row level security","force row level security",
  "revoke all on apex_internal.admin_offline_product_reviews from public,anon,authenticated",
  "revoke all on apex_internal.admin_offline_product_review_events from public,anon,authenticated",
  "(select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'",
  "select auth.uid()","insert into apex_internal.admin_offline_product_review_events",
  "on conflict (store_id,product_id) do update",
  "product_fingerprint","valid_until",
 ])assert.ok(sql.includes(token),token);
});
test("recorded approval does not change publication, payment or real eligibility",()=>{
 assert.doesNotMatch(sql,/update public\.products|update public\.supplier_listing_controls|update apex_internal\.product_release_authorizations|createInvoice|btcpay|update apex_internal\.retail_showcase_gate/i);
 assert.match(sql,/Public listing and checkout rules are unchanged/);
 assert.match(page,/AdminOfflineProductReviewForm/);
 assert.match(page,/get_admin_offline_product_reviews/);
 assert.match(form,/does not bypass product listing restrictions/);
 assert.match(form,/Review expiration/);
});
test("admin UI checks identity, server RPC and validates decisions",()=>{
 assert.match(action,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(action,/set_admin_offline_product_review/);
 assert.match(action,/revalidatePath\("\/admin\/catalog-release"\)/);
 assert.match(form,/name="status"/);
 assert.match(form,/name="reference"/);
 assert.match(form,/name="validUntil"/);
 assert.doesNotMatch(action,/service_role|SUPABASE_SECRET|createInvoice/);
});
