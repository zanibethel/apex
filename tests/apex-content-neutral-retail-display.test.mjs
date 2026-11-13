import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("supabase/migrations/20261113234500_apex_content_neutral_retail_display.sql","utf8");
const publish=sql.slice(sql.indexOf("create or replace function public.set_supplier_listing_intent("),
 sql.indexOf("create or replace function public.get_public_retail_showcase_catalog("));
const feed=sql.slice(sql.indexOf("create or replace function public.get_public_retail_showcase_catalog("));

test("latest database migration removes unconditional keyword exclusion in both display paths",()=>{
 assert.match(publish,/create or replace function public\.set_supplier_listing_intent/);
 assert.match(feed,/create or replace function public\.get_public_retail_showcase_catalog/);
 assert.doesNotMatch(publish,/\(v_product\.name\|\|' '\|\|coalesce\(v_product\.description,''\)\)\s*~\*/);
 assert.doesNotMatch(feed,/\(p\.name\|\|' '\|\|coalesce\(p\.description,''\)\)\s*!~\*/);
 assert.doesNotMatch(sql,/\(peptide\|anabolic\|steroid\|testosterone\|trenbolone\|injectable/);
});

test("supplier permission, holds, audit events and admin choices remain mandatory",()=>{
 for(const required of [
  "auth.uid()", "m.role in ('owner','manager')",
  "v_state.admin_gate<>'clear'", "republish_approval_required",
  "retail_product_visibility_restrictions", "private_product_review_states",
  "supplier_candidate_drafts", "listing_identity_holds", "supplier_listing_events",
  "v_product.price_cents<1", "length(btrim(coalesce(v_product.description,'')))"
 ])assert.ok(publish.includes(required),required);
 assert.match(publish,/p_action not in \('publish','unpublish'\)/);
 assert.match(feed,/lc\.supplier_wants_listing=true and lc\.admin_gate='clear'/);
 assert.match(feed,/retail_showcase_gate/);
 assert.match(feed,/retail_product_visibility_restrictions/);
 assert.match(feed,/private_product_review_states/);
 assert.match(feed,/'can_checkout',false/);
 assert.doesNotMatch(sql,/createInvoice|createPayment|update public\.stores\s+set is_public|update public\.products\s+set is_published/i);
});
