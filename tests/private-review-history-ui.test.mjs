import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatReviewTime} from "../src/lib/catalog/review-time.mjs";
import {
  reviewEventLabel,reviewEventActorLabel,reviewHistoryKey,groupReviewHistory,
} from "../src/lib/catalog/review-history.mjs";

const read=path=>readFileSync(path,"utf8");
const page=read("src/app/admin/product-reviews/page.tsx");
const css=read("src/app/globals.css");
const ci=read(".github/workflows/ci.yml");
const sql=read("database/tests/private_review_history_access_integration.sql");

test("history event labels distinguish every supported transition",()=>{
 assert.equal(reviewEventLabel("submitted"),"Submitted for internal review");
 assert.equal(reviewEventLabel("resubmitted"),"Resubmitted after changes");
 assert.equal(reviewEventLabel("changes_requested"),"Changes requested by admin");
 assert.equal(reviewEventLabel("approved_internal"),"Approved internally");
 assert.equal(reviewEventLabel("review_invalidated"),"Review invalidated after an edit");
 assert.equal(reviewEventLabel("__unknown__"),"Review activity");
 assert.equal(reviewEventActorLabel("review_invalidated",null),"System update");
 assert.equal(reviewEventActorLabel("review_invalidated","synthetic-user"),"Product editor");
 assert.equal(reviewEventActorLabel("changes_requested","synthetic-user"),"Platform admin");
 assert.equal(reviewEventActorLabel("resubmitted","synthetic-user"),"Supplier");
});

test("history groups by store AND product, not product name or SKU",()=>{
 const product="40000000-0000-4000-8000-000000000006";
 const a={id:11,store_id:"alpha",product_id:product,event_type:"submitted"};
 const b={id:12,store_id:"beta",product_id:product,event_type:"approved_internal"};
 const c={id:13,store_id:"beta",product_id:"another",event_type:"review_invalidated"};
 const groups=groupReviewHistory([a,b,c]);
 assert.deepEqual(groups.get(reviewHistoryKey("alpha",product)),[a]);
 assert.deepEqual(groups.get(reviewHistoryKey("beta",product)),[b]);
 assert.deepEqual(groups.get(reviewHistoryKey("beta","another")),[c]);
 assert.equal(groups.size,3);
});
test("event grouping bounds each card and handles absent history safely",()=>{
 const events=Array.from({length:33},(_,i)=>({
  id:40-i,store_id:"beta",product_id:"draft",created_at:"2026-10-31T19:00:00Z"
 }));
 assert.deepEqual(Array.from(groupReviewHistory(null).entries()),[]);
 assert.equal(groupReviewHistory(events,20).get("beta:draft")?.length,20);
 assert.equal(groupReviewHistory([{store_id:null,product_id:"x"}]).size,0);
});
test("history keeps Central time stable on daylight-saving boundaries",()=>{
 const october=formatReviewTime("2026-10-31T19:00:25.084489+00:00");
 const november=formatReviewTime("2026-11-02T19:00:25+00:00");
 assert.match(october,/Oct 31, 2026/);
 assert.match(october,/2:00/);
 assert.match(october,/CDT/);
 assert.match(november,/CST/);
});
test("admin UI reads RLS-protected audit history and fails closed",()=>{
 assert.match(page,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(page,/from\("private_product_review_history"\)/);
 assert.match(page,/\.select\("id,store_id,product_id,submission_id,event_type,actor_id,note,snapshot,created_at",\{count:"exact"\}\)/);
 assert.match(page,/\.in\("product_id",visibleProductIds\)/);
 assert.match(page,/\.limit\(500\)/);
 assert.match(page,/groupReviewHistory\(historyResult.data,20\)/);
 assert.match(page,/reviewHistoryKey\(item.store_id,item.product_id\)/);
 assert.match(page,/historyResult.error/);
 assert.match(page,/historyTruncated/);
 assert.match(page,/reviewEventLabel\(event.event_type\)/);
 assert.match(page,/formatReviewTime\(event.created_at\)/);
 assert.match(page,/reviewEventActorLabel\(event.event_type,event.actor_id\)/);
 assert.match(page,/event.note/);
 assert.match(page,/previous.sku/);
 assert.match(page,/Image on record:/);
 assert.match(page,/Review history/);
 assert.match(css,/\.apex-review-history > summary:focus-visible/);
 assert.doesNotMatch(page,/service_role|auth\.admin|\.insert\("private_product_review_history"/);
});
test("CI tests immutable history and prevents other tenant/staff visibility",()=>{
 assert.match(ci,/private_review_history_access_integration\.sql/);
 assert.match(sql,/Other supplier accessed Beta review history/);
 assert.match(sql,/Unassigned authenticated user accessed review history/);
 assert.match(sql,/Store manager cannot read own append-only review history/);
 assert.match(sql,/Verified admin cannot access the private review audit history/);
 assert.match(sql,/has_table_privilege\('authenticated','public.private_product_review_history','UPDATE'\)/);
 assert.match(sql,/has_table_privilege\('authenticated','public.private_product_review_history','DELETE'\)/);
 assert.match(sql,/Review history test unexpectedly published a product/);
});
