import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261110040000_apex_admin_retail_product_visibility_restrictions.sql");
const page=read("src/app/admin/catalog-release/page.tsx");
const action=read("src/app/admin/catalog-release/restriction-actions.ts");
const form=read("src/app/admin/catalog-release/restriction-form.tsx");

test("new category eligibility is ownership-only and has no category name/archival blocklist",()=>{
 const start=sql.indexOf("create or replace function apex_internal.retail_showcase_category_allowed");
 const stop=sql.indexOf("revoke all on function apex_internal.retail_showcase_category_allowed",start);
 assert.ok(start>=0&&stop>start);
 const fn=sql.slice(start,stop);
 assert.match(fn,/from public\.categories c/);
 assert.match(fn,/c\.id=p_category_id and c\.store_id=p_store_id/);
 assert.doesNotMatch(fn,/c\.slug|c\.name|archived_at|peptide|steroid|hormon|nicotine|firearm/);
 assert.match(sql,/get_public_retail_showcase_catalog/);
 assert.match(sql,/get_admin_retail_product_restrictions/);
});

test("verified admin can manage a private auditable product restriction list",()=>{
 assert.match(sql,/create table if not exists apex_internal\.retail_product_visibility_restrictions/);
 assert.match(sql,/create table if not exists apex_internal\.retail_product_visibility_restriction_events/);
 assert.match(sql,/foreign key\(store_id,product_id\) references public\.products\(store_id,id\)/);
 assert.match(sql,/revoke all on apex_internal\.retail_product_visibility_restrictions from public,anon,authenticated/);
 assert.match(sql,/alter table apex_internal\.retail_product_visibility_restrictions enable row level security/);
 assert.match(sql,/alter table apex_internal\.retail_product_visibility_restriction_events enable row level security/);
 assert.match(sql,/revoke all on apex_internal\.retail_product_visibility_restriction_events from public,anon,authenticated/);
 assert.match(sql,/\(select auth\.jwt\(\)\) #>> '\{app_metadata,apex_role\}' is distinct from 'platform_admin'/);
 assert.match(sql,/p_restrict is null/);
 assert.match(sql,/p_restrict=true and \(v_note is null/);
 assert.match(sql,/join public\.stores s on s\.id=p\.store_id and s\.is_public=false/);
 assert.match(sql,/p\.store_id=p_store_id and p\.id=p_product_id/);
 assert.match(sql,/on conflict\(store_id,product_id\) do update/);
 assert.match(sql,/action in \('restrict','unrestrict'\)/);
 assert.match(sql,/grant execute on function public\.get_admin_retail_product_restrictions\(\) to authenticated/);
 assert.match(sql,/grant execute on function public\.set_admin_retail_product_restriction\(uuid,uuid,boolean,text\)/);
});

test("restricted product is excluded from public feed and supplier publication independently",()=>{
 assert.match(sql,/if exists\(select 1 from apex_internal\.retail_product_visibility_restrictions r/);
 assert.match(sql,/where r\.store_id=p_store_id and r\.product_id=p_product_id and r\.is_restricted=true/);
 assert.match(sql,/and not exists\(select 1 from apex_internal\.retail_product_visibility_restrictions b/);
 assert.match(sql,/where b\.store_id=p\.store_id and b\.product_id=p\.id and b\.is_restricted=true/);
 assert.match(sql,/lc\.supplier_wants_listing=true and lc\.admin_gate='clear'/);
 assert.match(sql,/listing_identity_holds/);
 assert.match(sql,/private_product_review_states/);
 assert.match(sql,/supplier_candidate_drafts/);
 assert.match(sql,/retail_showcase_gate/);
 assert.match(sql,/'can_checkout',false/);
 assert.match(sql,/'tags',eligible\.tags/);
 assert.match(sql,/Only ordinary retail products are eligible for this showcase/);
 assert.doesNotMatch(sql,/createInvoice|btcpay|update public\.stores\s+set is_public|update public\.products\s+set is_published/i);
});

test("admin portal lists all restricted product identities and permits additions/removals",()=>{
 assert.match(page,/get_admin_retail_product_restrictions/);
 assert.match(page,/restrictionsAvailable/);
 assert.match(page,/restrictionsByProduct/);
 assert.match(page,/AdminProductDisplayRestrictionForm/);
 assert.match(page,/id="visibility-restrictions"/);
 assert.match(page,/Retail product restriction list/);
 assert.match(page,/range\(from,from\+PAGE_LIMIT-1\)/);
 assert.match(form,/name="action" value=\{restricted\?"unrestrict":"restrict"\}/);
 assert.match(form,/name="reason"/);
 assert.match(form,/required minLength=\{3\}/);
 assert.match(action,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(action,/set_admin_retail_product_restriction/);
 assert.match(action,/revalidatePath\(path\)/);
 assert.doesNotMatch(action,/service_role|SUPABASE_SECRET|createInvoice/);
 assert.match(read("src/app/admin/page.tsx"),/Display restrictions/);
});
