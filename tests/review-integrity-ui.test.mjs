import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatReviewTime} from "../src/lib/catalog/review-time.mjs";
const read=path=>readFileSync(path,"utf8");
const admin=read("src/app/admin/product-reviews/page.tsx");
const sql=read("database/sql/apex_review_integrity_admin_images_REVIEW_ONLY.sql");
const integration=read("database/tests/review_integrity_integration.sql");
const workflow=read(".github/workflows/ci.yml");

test("review timestamps always use Central timezone even on UTC servers",()=>{
 const when=formatReviewTime("2026-10-31T18:31:11.735641+00:00");
 assert.match(when,/Oct 31, 2026/);
 assert.match(when,/1:31/);
 assert.match(when,/CDT/);
 assert.equal(formatReviewTime("bad date"),"Unavailable");
 assert.equal(formatReviewTime(null),"Not yet");
});
test("admin queue distinguishes review outcomes and short-lived private photo preview",()=>{
 assert.match(admin,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(admin,/createSignedUrl\(path,90\)/);
 assert.match(admin,/Image src=\{imageUrl\}/);
 assert.match(admin,/unoptimized/);
 assert.match(admin,/formatReviewTime\(item.submitted_at\)/);
 assert.match(admin,/formatReviewTime\(item.decided_at\)/);
 assert.match(admin,/counts\.pending/);
 assert.match(admin,/counts\.needsChanges/);
 assert.match(admin,/counts\.approved/);
 assert.match(admin,/Internal content approved/);
 assert.match(admin,/Awaiting supplier changes and resubmission/);
 assert.match(admin,/This listing is not publicly available/);
 assert.doesNotMatch(admin,/getPublicUrl|createPublicUrl|service_role|publishProduct/);
});
test("approval invalidation is triggered by actual product and inventory changes",()=>{
 assert.match(sql,/after update of name,sku,description,category_id,price_cents/);
 assert.match(sql,/compare_at_price_cents,image_path,is_active,currency/);
 assert.match(sql,/after insert or update or delete on public.inventory_items/);
 assert.match(sql,/old\.quantity_on_hand is not distinct from new\.quantity_on_hand/);
 assert.match(sql,/old\.sku is distinct from new\.sku/);
 assert.match(sql,/status='changes_requested'/);
 assert.match(sql,/event_type/);
 assert.match(sql,/review_invalidated/);
 assert.match(sql,/for update/);
 assert.match(sql,/snapshot/);
 assert.doesNotMatch(sql,/set is_published|set is_public|grant update .*is_published/i);
});
test("only verified admins can retrieve snapshot images from existing private bucket",()=>{
 assert.match(sql,/create policy "apex_admin_read_submitted_image"/);
 assert.match(sql,/for select to authenticated using/);
 assert.match(sql,/#>> '\{app_metadata,apex_role\}' = 'platform_admin'/);
 assert.match(sql,/r\.snapshot->>'image_path'=objects\.name/);
 assert.match(sql,/p\.is_published=false and s\.is_public=false/);
 assert.match(sql,/bucket_id='apex-draft-product-images'/);
 assert.doesNotMatch(sql,/create policy.*for insert to anon|set public=true|grant all on storage/i);
 assert.match(integration,/Non-admin obtained private submitted images/);
 assert.match(integration,/Admin cannot read exactly the submitted private image/);
 assert.match(integration,/Product details changed after submission/);
 assert.match(workflow,/review_integrity_integration\.sql/);
});
