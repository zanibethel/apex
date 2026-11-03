import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAdminCategories,categoryPublicationSummary}
 from "../src/lib/catalog/admin-category-publication.mjs";
const read=p=>readFileSync(p,"utf8");
const row=()=>({
 store_id:"62000000-0000-0000-0000-000000000001",
 category_id:"63000000-0000-0000-0000-000000000001",
 store_name:"Apex seller",category_name:"GetSwole",
 is_published:false,product_count:63,active_count:1,
});
test("admin overview parses strict independent category status",()=>{
 const categories=parseAdminCategories([row()]);
 assert.equal(categories.length,1);
 assert.equal(categories[0].categoryName,"GetSwole");
 assert.equal(categories[0].published,false);
 assert.equal(categories[0].productCount,63);
 assert.ok(Object.isFrozen(categories));
 assert.ok(Object.isFrozen(categories[0]));
 assert.deepEqual(categoryPublicationSummary(categories),{
  available:true,total:1,published:0,unpublished:1,products:63,
 });
 assert.deepEqual(categoryPublicationSummary(null),{
  available:false,total:null,published:null,unpublished:null,products:null,
 });
});
test("category parser fails closed on missing, duplicate or malformed data",()=>{
 for(const invalid of [
  undefined,{},[null],[{...row(),category_id:"not-uuid"}],
  [{...row(),is_published:"true"}],
  [{...row(),product_count:-2}],
  [{...row(),active_count:64}],
  [{...row(),category_name:""}],[row(),row()],
  Array.from({length:151},()=>row()),
 ])assert.equal(parseAdminCategories(invalid),null);
 assert.deepEqual(categoryPublicationSummary([]),{
  available:true,total:0,published:0,unpublished:0,products:0,
 });
});
test("verified-admin-only category dashboard and action have no direct table write",()=>{
 const page=read("src/app/admin/categories/page.tsx");
 const actions=read("src/app/admin/categories/actions.ts");
 const form=read("src/app/admin/categories/form.tsx");
 const dashboard=read("src/app/admin/page.tsx");
 for(const s of [page,actions]){
  assert.match(s,/createSupplierServerClient\(\)/);
  assert.match(s,/auth\.getUser\(\)/);
  assert.match(s,/isVerifiedPlatformAdmin\(/);
 }
 assert.match(page,/get_admin_category_publication_overview/);
 assert.match(page,/parseAdminCategories\(result\.data\)/);
 assert.match(page,/Nothing has been changed/);
 assert.match(page,/Checkout is unavailable/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.match(actions,/set_admin_category_publication/);
 assert.match(actions,/reason\.trim\(\)\.length<3/);
 assert.match(actions,/revalidatePath\("\/admin\/catalog-release"\)/);
 assert.match(form,/value=\{published\?"unpublish":"publish"\}/);
 assert.match(form,/required disabled=\{pending\}/);
 assert.match(dashboard,/href: "\/admin\/categories"/);
 assert.doesNotMatch(page+actions+form,/service_role|createPublicUrl|\.insert\(|\.update\(|\.delete\(|\.upsert\(|createInvoice|createPayout|SUPABASE_SECRET/);
});
test("publication migration cannot approve products or open release gate",()=>{
 const sql=read("supabase/migrations/20261103044500_apex_admin_category_publication.sql");
 const ci=read(".github/workflows/payout-rls.yml");
 const integration=read("tests/payout-rls/admin-category-publication.sql");
 assert.match(sql,/set_admin_category_publication\(/);
 assert.match(sql,/get_admin_category_publication_overview\(/);
 assert.match(sql,/create table public\.apex_category_publication_events/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/verified platform admin required/i);
 assert.match(sql,/app_metadata,apex_role/);
 assert.match(sql,/category_name,action,reason,actor_id/);
 assert.match(sql,/revoke all on function/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/enabled=false/);
 assert.doesNotMatch(sql,/update public\.products|update public\.stores|update apex_internal\.private_release_gate|grant update\(is_published\)|create_invoice|bitcoin|payout/i);
 assert.match(ci,/admin-category-publication\.sql/);
 assert.match(integration,/Supplier forged category unpublish/);
 assert.match(integration,/User metadata role bypassed admin/);
 assert.match(integration,/Category publication audit incomplete or duplicated/);
 assert.match(integration,/Category action exposed public products without approval/);
});
test("release overview includes per-product actionable data gaps without inventing eligibility",()=>{
 const page=read("src/app/admin/catalog-release/page.tsx");
 assert.match(page,/draftSetupSteps\(p,inventory\)/);
 assert.match(page,/Needs: /);
 assert.match(page,/description,price_cents/);
 assert.match(page,/href="\/admin\/categories"/);
 assert.match(page,/get_private_release_readiness/);
 assert.match(page,/classification|classifyAdminRelease/);
 assert.doesNotMatch(page,/\.update\(|\.insert\(|\.delete\(/);
});
